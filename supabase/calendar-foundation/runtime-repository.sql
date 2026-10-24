-- DRAFT ONLY. Apply only after calendar-foundation.sql and explicit deployment approval.
-- A service-role-only RPC is used instead of exposing the private schema to PostgREST.
begin;
alter table daybook_private.calendar_oauth_states add column connection_id uuid not null, add column browser_nonce_hash text not null;
alter table daybook_private.calendar_creates add column request_key text unique;
alter table daybook_private.calendar_selections add column selected boolean not null default true;
alter table daybook_private.calendar_connections add column refresh_until timestamptz, add column refresh_lease uuid;
create table daybook_private.calendar_rate_limits(owner_id uuid primary key references auth.users(id) on delete cascade, window_start timestamptz not null, requests integer not null);
revoke all on daybook_private.calendar_rate_limits from public,anon,authenticated;
alter table daybook_private.calendar_rate_limits enable row level security;
create or replace function public.daybook_calendar_repository(operation text, owner uuid, input jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, daybook_private as $$
declare result jsonb; existing daybook_private.calendar_creates; inserted integer;
begin
 if operation='put_state' then
  delete from daybook_private.calendar_oauth_states where expires_at < now() - interval '1 day';
  insert into daybook_private.calendar_oauth_states(state_hash,owner_id,connection_id,encrypted_verifier,expires_at,redirect_uri,browser_nonce_hash)
  values(input->>'hash',owner,(input->>'connectionId')::uuid,input->'verifier',(input->>'expiresAt')::timestamptz,input->>'redirectUri',input->>'nonceHash'); return '{}'::jsonb;
 elsif operation='consume_state' then
  update daybook_private.calendar_oauth_states set used_at=now()
  where state_hash=input->>'hash' and owner_id=owner and browser_nonce_hash=input->>'nonceHash' and used_at is null and expires_at>now() returning to_jsonb(calendar_oauth_states.*) into result; return result;
 end if;
 if owner is null then raise exception 'owner required'; end if;
 if operation='rate_limit' then
  insert into daybook_private.calendar_rate_limits(owner_id,window_start,requests) values(owner,now(),1)
  on conflict(owner_id) do update set
   requests=case when calendar_rate_limits.window_start < now()-interval '1 minute' then 1 else calendar_rate_limits.requests+1 end,
   window_start=case when calendar_rate_limits.window_start < now()-interval '1 minute' then now() else calendar_rate_limits.window_start end
  returning to_jsonb(requests<=60) into result; return result;
 elsif operation='claim_refresh' then
  update daybook_private.calendar_connections set refresh_until=now()+interval '60 seconds',refresh_lease=(input->>'lease')::uuid where owner_id=owner and id=(input->>'id')::uuid and state='connected' and (refresh_until is null or refresh_until<now());
  get diagnostics inserted = row_count; return to_jsonb(inserted=1);
 elsif operation='release_refresh' then
  update daybook_private.calendar_connections set refresh_until=null,refresh_lease=null where owner_id=owner and id=(input->>'id')::uuid and refresh_lease=(input->>'lease')::uuid; return '{}'::jsonb;
 elsif operation='save_connection' then
  insert into daybook_private.calendar_connections(id,owner_id,provider,state,encrypted_credentials,granted_scopes)
  values((input->>'id')::uuid,owner,input->>'provider','connected',input->'credentials',array(select jsonb_array_elements_text(input->'scopes'))); return '{}'::jsonb;
 elsif operation='connection' then
  select to_jsonb(c) into result from daybook_private.calendar_connections c where c.owner_id=owner and c.id=(input->>'id')::uuid; return result;
 elsif operation='connections' then
  select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) into result from daybook_private.calendar_connections c where c.owner_id=owner; return result;
 elsif operation='credentials' then
  update daybook_private.calendar_connections set encrypted_credentials=input->'credentials' where owner_id=owner and id=(input->>'id')::uuid and refresh_lease=(input->>'lease')::uuid and refresh_until>now(); get diagnostics inserted = row_count; return to_jsonb(inserted=1);
 elsif operation='reconnect' then
  update daybook_private.calendar_connections set state='reconnect_required' where owner_id=owner and id=(input->>'id')::uuid and refresh_lease=(input->>'lease')::uuid and refresh_until>now(); return '{}'::jsonb;
 elsif operation='remove' then
  delete from daybook_private.calendar_creates where owner_id=owner and connection_id=(input->>'id')::uuid;
  delete from daybook_private.calendar_connections where owner_id=owner and id=(input->>'id')::uuid; return '{}'::jsonb;
 elsif operation='selections' then
  select coalesce(jsonb_agg(jsonb_build_object('calendarId',calendar_id,'name',display_name,'writable',writable)),'[]'::jsonb) into result
  from daybook_private.calendar_selections where owner_id=owner and connection_id=(input->>'id')::uuid and selected; return result;
 elsif operation='select' then
  if jsonb_array_length(input->'calendars')>100 then raise exception 'too many calendars'; end if;
  if not exists(select 1 from daybook_private.calendar_connections where owner_id=owner and id=(input->>'id')::uuid and state='connected') then raise exception 'connection unavailable'; end if;
  -- Preserve idempotency history even when a calendar is deselected/reselected.
  update daybook_private.calendar_selections set selected=false where owner_id=owner and connection_id=(input->>'id')::uuid;
  insert into daybook_private.calendar_selections(owner_id,connection_id,calendar_id,display_name,writable,selected)
  select owner,(input->>'id')::uuid,value->>'id',value->>'name',(value->>'writable')::boolean,true from jsonb_array_elements(input->'calendars')
  on conflict(owner_id,connection_id,calendar_id) do update set display_name=excluded.display_name,writable=excluded.writable,selected=true; return '{}'::jsonb;
 elsif operation='cancel_unreserved' then
  -- Serialize cancellation against reserve with the identical unique request key.
  -- Never rewrite a pending, uncertain, failed, or complete reservation.
  insert into daybook_private.calendar_creates(owner_id,connection_id,calendar_id,request_id,payload_hash,provider_event_id,state,request_key)
  values(owner,(input->>'id')::uuid,input->>'calendarId',(input->>'requestId')::uuid,input->>'payloadHash',input->>'key','cancelled',input->>'key') on conflict do nothing;
  select to_jsonb(c.state='cancelled') into result from daybook_private.calendar_creates c where c.owner_id=owner and c.request_key=input->>'key';
  return coalesce(result,'false'::jsonb);
 elsif operation='creation' then
  select to_jsonb(c) into result from daybook_private.calendar_creates c where c.owner_id=owner and c.request_key=input->>'key'; return result;
 elsif operation='reserve' then
  insert into daybook_private.calendar_creates(owner_id,connection_id,calendar_id,request_id,payload_hash,provider_event_id,state,request_key)
  values(owner,(input->>'id')::uuid,input->>'calendarId',(input->>'requestId')::uuid,input->>'payloadHash',input->>'key','pending',input->>'key') on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted=1 then return '"new"'::jsonb; end if;
  select * into existing from daybook_private.calendar_creates where owner_id=owner and request_key=input->>'key';
  if existing.state='cancelled' then return '"cancelled"'::jsonb; end if;
  if existing.payload_hash is distinct from input->>'payloadHash' then return '"mismatch"'::jsonb; end if;
  return to_jsonb(case when existing.state='complete' then 'complete' else 'pending' end);
 elsif operation='finish' then
  update daybook_private.calendar_creates set state='complete' where owner_id=owner and request_key=input->>'key';return '{}'::jsonb;
 else raise exception 'unsupported operation'; end if;
end $$;
revoke all on function public.daybook_calendar_repository(text,uuid,jsonb) from public,anon,authenticated;
grant usage on schema daybook_private to service_role;
grant select,insert,update,delete on daybook_private.calendar_connections,daybook_private.calendar_selections,daybook_private.calendar_oauth_states,daybook_private.calendar_creates,daybook_private.calendar_rate_limits to service_role;
grant execute on function public.daybook_calendar_repository(text,uuid,jsonb) to service_role;
commit;
