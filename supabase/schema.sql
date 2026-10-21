-- Daybook account-isolated storage. Apply once to a new Supabase project.
create table public.daybook_workspaces (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=5000000),
 version integer not null check(version>0),
 updated_at timestamptz not null default now()
);
alter table public.daybook_workspaces enable row level security;
revoke all on public.daybook_workspaces from anon;
grant select,insert,update on public.daybook_workspaces to authenticated;
create policy own_read on public.daybook_workspaces for select to authenticated using(owner_id=(select auth.uid()));
create policy own_insert on public.daybook_workspaces for insert to authenticated with check(owner_id=(select auth.uid()));
create policy own_update on public.daybook_workspaces for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create function public.save_daybook(document jsonb, expected_version integer) returns integer
language plpgsql security invoker set search_path='' as $$
declare next_version integer;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if expected_version is null or expected_version<0 then raise exception 'Invalid version'; end if;
 if expected_version=0 then
  insert into public.daybook_workspaces(owner_id,payload,version) values(auth.uid(),document,1)
  on conflict(owner_id) do nothing returning version into next_version;
 else
  update public.daybook_workspaces set payload=document,version=version+1,updated_at=now()
  where owner_id=auth.uid() and version=expected_version returning version into next_version;
 end if;
 if next_version is null then raise exception 'Save conflict' using errcode='40001'; end if;
 return next_version;
end; $$;
revoke all on function public.save_daybook(jsonb,integer) from public,anon;
grant execute on function public.save_daybook(jsonb,integer) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('daybook-receipts','daybook-receipts',false,10485760,array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']);
create policy receipt_read on storage.objects for select to authenticated using(bucket_id='daybook-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy receipt_insert on storage.objects for insert to authenticated with check(bucket_id='daybook-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
