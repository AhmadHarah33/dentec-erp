-- Serial numbers and warranty.
--
-- An item can be flagged as serial-tracked (machines). Issuing an invoice for
-- one records each unit's serial; a unit remembers which customer and invoice
-- it went to and when its warranty ends. A service job can then be tied to the
-- exact unit rather than to a free-text serial.

begin;

alter table erp.items
  add column tracks_serial   boolean default false,
  add column warranty_months integer default 0 check (warranty_months is null or warranty_months >= 0);

-- Serials entered when the invoice was issued, in line order.
alter table erp.sales_invoice_lines add column serials text[];

create table erp.units (
  id            text primary key,
  item_id       text not null references erp.items (id) deferrable initially deferred,
  serial_no     text not null check (btrim(serial_no) <> ''),
  customer_id   text references erp.customers (id) deferrable initially deferred,
  invoice_id    text references erp.sales_invoices (id) on delete set null deferrable initially deferred,
  sold_at       date,
  warranty_end  date,
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Case-insensitive: "ab-100" and "AB-100" are the same machine.
  unique (item_id, serial_no)
);
create unique index units_item_serial_ci on erp.units (item_id, lower(serial_no));
create index units_customer_idx on erp.units (customer_id);
create index units_invoice_idx on erp.units (invoice_id);

alter table erp.service_jobs
  add column unit_id text references erp.units (id) on delete set null deferrable initially deferred;

create trigger units_bump_version after insert or update or delete on erp.units
  for each statement execute function erp.bump_version();
insert into erp.table_versions (table_name, version) values ('units', 0);

alter table erp.units enable row level security;
create policy units_app on erp.units for all to dentec_app using (true) with check (true);
revoke all on erp.units from public;
grant select, insert, update, delete on erp.units to dentec_app;

commit;
