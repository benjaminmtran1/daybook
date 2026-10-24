-- DRAFT ONLY. Not deployed. Requires approval and security review before applying.
-- Credentials and OAuth state are never exposed through public PostgREST schemas.
begin;
create schema if not exists daybook_private;
revoke all on schema daybook_private from public, anon, authenticated;
create table daybook_private.calendar_connections (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in ('google','icloud')),
 state text not null default 'disconnected' check(state in ('connected','disconnected','reconnect_required')),
 encrypted_credentials jsonb not null, -- AES-GCM ciphertext + IV + key version, never plaintext
 granted_scopes text[] not null default '{}',
 created_at timestamptz not null default now(),
 unique(owner_id,id)
);
create table daybook_private.calendar_selections (
 owner_id uuid not null, connection_id uuid not null, calendar_id text not null,
 display_name text not null, writable boolean not null default false,
 primary key(owner_id,connection_id,calendar_id),
 foreign key(owner_id,connection_id) references daybook_private.calendar_connections(owner_id,id) on delete cascade
);
create table daybook_private.calendar_oauth_states (
 state_hash text primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 encrypted_verifier jsonb not null, expires_at timestamptz not null,
 used_at timestamptz, redirect_uri text not null
);
create table daybook_private.calendar_creates (
 owner_id uuid not null, connection_id uuid not null, calendar_id text not null,
 request_id uuid not null, payload_hash text not null, provider_event_id text not null,
 state text not null check(state in ('pending','complete','uncertain','failed','cancelled')),
 primary key(owner_id,connection_id,calendar_id,request_id),
 foreign key(owner_id,connection_id,calendar_id) references daybook_private.calendar_selections(owner_id,connection_id,calendar_id) on delete cascade
);
revoke all on all tables in schema daybook_private from public, anon, authenticated;
alter table daybook_private.calendar_connections enable row level security;
alter table daybook_private.calendar_selections enable row level security;
alter table daybook_private.calendar_oauth_states enable row level security;
alter table daybook_private.calendar_creates enable row level security;
-- No client policies by design. Gateway uses a narrowly scoped server role, never browser keys.
commit;
