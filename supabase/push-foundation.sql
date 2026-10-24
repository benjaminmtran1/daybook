-- DRAFT ONLY. Not applied. Requires independent SQL/RLS review and staging verification.
-- Created without CLI because no Supabase CLI is installed in this task environment.
-- No cron job, credential creation, function deployment or persistent access is enabled here.
create table public.daybook_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique check (length(endpoint) <= 2048),
 subscription jsonb not null check (octet_length(subscription::text) < 4096),
 preferences jsonb not null check (octet_length(preferences::text) < 50000),
 updated_at timestamptz not null default now()
);
create index daybook_push_owner on public.daybook_push_subscriptions(owner_id);
alter table public.daybook_push_subscriptions enable row level security;
revoke all on public.daybook_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.daybook_push_subscriptions to service_role;
-- Only verified Edge Function owner-filtered access; no client policies or direct client access.
create table public.daybook_push_attempts (
 subscription_id uuid not null references public.daybook_push_subscriptions(id) on delete cascade,
 event_key text not null check (length(event_key) <= 250),
 state text not null default 'claimed' check (state in ('claimed','accepted','rejected','unknown')),
 attempted_at timestamptz not null default now(),
 primary key (subscription_id,event_key)
);
alter table public.daybook_push_attempts enable row level security;
revoke all on public.daybook_push_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.daybook_push_attempts to service_role;
-- The composite primary key is the cross-worker, per-device daily/task deduplication claim.
-- Retain claims >= 48 hours. Future cleanup must not delete claims still inside candidate windows.

-- Fair dispatcher rotation; a bounded batch never blocks every device at a global row threshold.
alter table public.daybook_push_subscriptions add column checked_at timestamptz not null default '-infinity';
create index daybook_push_dispatch_order on public.daybook_push_subscriptions(checked_at,id);
create table public.daybook_push_mutation_limits (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 minute timestamptz not null,
 attempts integer not null
);
alter table public.daybook_push_mutation_limits enable row level security;
revoke all on public.daybook_push_mutation_limits from public, anon, authenticated;
grant select, insert, update, delete on public.daybook_push_mutation_limits to service_role;

-- Atomic owner rate limit. No untrusted client can invoke this function or supply the owner.
create function public.daybook_push_limit(p_owner uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare total integer;
begin
 insert into public.daybook_push_mutation_limits(owner_id,minute,attempts)
 values(p_owner,date_trunc('minute',now()),1)
 on conflict(owner_id) do update set
 attempts=case when daybook_push_mutation_limits.minute=excluded.minute then daybook_push_mutation_limits.attempts+1 else 1 end,
 minute=excluded.minute
 returning attempts into total;
 if total>20 then raise exception 'Too many reminder changes; try again shortly' using errcode='54000'; end if;
end; $$;
revoke all on function public.daybook_push_limit(uuid) from public,anon,authenticated;
grant execute on function public.daybook_push_limit(uuid) to service_role;

-- Single transaction: owner lock, quota check, endpoint ownership and insert/update.
create function public.daybook_push_subscribe(p_owner uuid,p_subscription jsonb,p_preferences jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare existing_owner uuid; total integer; target text;
begin
 if p_owner is null then raise exception 'Owner required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,0));
 perform public.daybook_push_limit(p_owner);
 target=p_subscription->>'endpoint';
 if target is null then raise exception 'Endpoint required'; end if;
 select owner_id into existing_owner from public.daybook_push_subscriptions where endpoint=target;
 if existing_owner is not null then
  if existing_owner<>p_owner then raise exception 'Device belongs to another account'; end if;
  update public.daybook_push_subscriptions set subscription=p_subscription,preferences=p_preferences,updated_at=now()
   where owner_id=p_owner and endpoint=target;
 else
  select count(*) into total from public.daybook_push_subscriptions where owner_id=p_owner;
  if total>=10 then raise exception 'Device limit reached' using errcode='54000'; end if;
  insert into public.daybook_push_subscriptions(owner_id,endpoint,subscription,preferences)
   values(p_owner,target,p_subscription,p_preferences);
 end if;
end; $$;
revoke all on function public.daybook_push_subscribe(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.daybook_push_subscribe(uuid,jsonb,jsonb) to service_role;
