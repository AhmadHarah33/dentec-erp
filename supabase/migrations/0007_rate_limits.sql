-- Rate limiting for the public auth endpoints (sign-in, forgot password).
--
-- One row per limited thing (a sign-in attempt target, a client address, a
-- reset-request address), counting hits inside a window. The count is moved
-- with a single INSERT … ON CONFLICT statement, so parallel requests cannot
-- read the same value and all slip under the limit.
--
-- Like the other auth tables, not part of the cached snapshot and not
-- change-tracked.

begin;

create table erp.rate_limits (
  key          text primary key,
  hits         integer     not null,
  window_start timestamptz not null default now()
);
create index rate_limits_window_idx on erp.rate_limits (window_start);

alter table erp.rate_limits enable row level security;
create policy rate_limits_app on erp.rate_limits for all to dentec_app using (true) with check (true);
revoke all on erp.rate_limits from public;
grant select, insert, update, delete on erp.rate_limits to dentec_app;

commit;
