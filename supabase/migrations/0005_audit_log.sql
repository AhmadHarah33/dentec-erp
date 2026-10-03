-- Audit log: who changed what, and when. Written by the app inside the same
-- transaction as the change itself, so a change and its record land together
-- or not at all. Append-only: a trigger rejects UPDATE and DELETE, the same
-- way the stock ledger is protected.
--
-- Not part of the cached Database snapshot; it is read on demand by the
-- Activity page and the per-record history.

begin;

create table erp.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  -- Null when the change did not come from a signed-in person (a script, a migration).
  actor_id   text,
  actor_name text not null default '',
  actor_role text not null default '',
  collection text not null,
  record_id  text not null,
  -- Number, name or SKU: enough to recognise the record after it is deleted.
  label      text not null default '',
  action     text not null check (action in ('insert','update','delete')),
  -- Insert: the new row in "after". Delete: the old row in "before".
  -- Update: only the fields that changed, old values in "before", new in "after".
  before     jsonb,
  after      jsonb
);
create index audit_log_at_idx on erp.audit_log (at desc, id desc);
create index audit_log_record_idx on erp.audit_log (collection, record_id, at desc);
create index audit_log_actor_idx on erp.audit_log (actor_id, at desc);

create function erp.audit_log_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'erp.audit_log is append-only';
end $$;

create trigger audit_log_no_update_delete
  before update or delete on erp.audit_log
  for each row execute function erp.audit_log_immutable();

alter table erp.audit_log enable row level security;
create policy audit_log_app on erp.audit_log for all to dentec_app using (true) with check (true);
revoke all on erp.audit_log from public;
grant select, insert on erp.audit_log to dentec_app;

commit;
