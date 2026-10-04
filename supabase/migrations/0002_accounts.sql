-- ERP accounts: credentials, sessions and one-time links.
--
-- The ERP authenticates its own users instead of using Supabase Auth. The
-- Supabase instance is shared with another project whose tables grant
-- access to any authenticated Supabase user, so an ERP employee holding a
-- Supabase account could have reached that project's data. These tables
-- keep ERP identities entirely inside the erp schema.
--
-- None of these tables carry the change-tracking trigger: they are not part
-- of the app's cached snapshot (sessions change on every sign-in, and
-- password hashes must never be loaded alongside data sent to the browser).
-- The auth module reads and writes them directly.

begin;

-- One row per person who can sign in. A user without a row here is named in
-- the ERP (a technician on a job) but has no login.
create table erp.credentials (
  user_id         text primary key references erp.users (id) on delete cascade,
  -- scrypt$N$r$p$salt$hash — never a reversible encoding of the password.
  password_hash   text not null,
  password_set_at timestamptz not null default now(),
  last_sign_in_at timestamptz,
  -- Throttling: after repeated failures the account waits before trying again.
  failed_attempts integer not null default 0,
  locked_until    timestamptz
);

-- Sessions are identified by the SHA-256 of a random cookie token; the token
-- itself is never stored, so a leaked table cannot be replayed as cookies.
create table erp.sessions (
  id           text primary key,
  user_id      text not null references erp.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now(),
  user_agent   text not null default ''
);
create index sessions_user_idx on erp.sessions (user_id);
create index sessions_expiry_idx on erp.sessions (expires_at);

-- Invitation and password-reset links: single use, short-lived, hashed.
create table erp.auth_tokens (
  id         text primary key,
  user_id    text not null references erp.users (id) on delete cascade,
  kind       text not null check (kind in ('invite','reset')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);
create index auth_tokens_user_idx on erp.auth_tokens (user_id, kind);

do $$
declare
  t text;
begin
  foreach t in array array['credentials','sessions','auth_tokens'] loop
    execute format('alter table erp.%I enable row level security', t);
    execute format(
      'create policy %I on erp.%I for all to dentec_app using (true) with check (true)',
      t || '_app', t);
    execute format('revoke all on erp.%I from public', t);
    execute format('grant select, insert, update, delete on erp.%I to dentec_app', t);
  end loop;
end $$;

commit;
