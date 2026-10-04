-- Dentec ERP — core schema.
--
-- Everything lives in its own `erp` schema. Supabase's REST gateway exposes
-- `public` (and `graphql_public`, `storage`); `erp` is not on that list, and
-- RLS is enabled on every table with policies only for the app's own role,
-- so nothing here is reachable with the anon or authenticated API keys even
-- if the schema were exposed by mistake. The app talks to Postgres directly
-- from the server as `dentec_app`.
--
-- Shapes mirror src/lib/data/types.ts field for field (camelCase → snake_case).
-- Money, quantities and rates are unconstrained `numeric`: exact, and never
-- rounds a value the app computed.

begin;

create schema if not exists erp;

-- The application role. It is created without a password; the deploy step
-- sets one (`alter role dentec_app login password '…'`) so no secret is ever
-- written into a migration.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'dentec_app') then
    create role dentec_app nologin;
  end if;
end $$;

revoke all on schema erp from public;
grant usage on schema erp to dentec_app;

-- ---------------------------------------------------------------------
-- Change tracking
--
-- One counter per table, bumped once per statement that writes to it. The
-- app caches what it has read and asks this table, in one cheap query,
-- which tables have changed since — so a page view does not reload twelve
-- tables, and two app instances never serve each other stale data.
-- ---------------------------------------------------------------------

create table erp.table_versions (
  table_name text primary key,
  version    bigint not null default 0
);

create function erp.bump_version() returns trigger
language plpgsql security definer set search_path = erp as $$
begin
  insert into erp.table_versions as v (table_name, version)
  values (tg_table_name, 1)
  on conflict (table_name) do update set version = v.version + 1;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- Settings — a singleton. Stored as one jsonb document: it is configuration
-- read whole and written whole, never queried by field.
-- ---------------------------------------------------------------------

create table erp.settings (
  id         smallint primary key default 1 check (id = 1),
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- People and catalog
-- ---------------------------------------------------------------------

create table erp.users (
  id         text primary key,
  name       text not null,
  email      text not null default '',
  phone      text not null default '',
  role       text not null check (role in ('owner','accountant','sales','technician','viewer')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table erp.categories (
  id         text primary key,
  name_ar    text not null,
  name_tr    text not null default '',
  parent_id  text references erp.categories (id) deferrable initially deferred,
  applies_to text not null check (applies_to in ('product','spare_part','both')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table erp.items (
  id            text primary key,
  sku           text not null,
  name_ar       text not null,
  name_tr       text not null default '',
  item_type     text not null check (item_type in ('product','spare_part')),
  category_id   text references erp.categories (id) deferrable initially deferred,
  unit          text not null check (unit in ('piece','box','set','meter','kg','liter')),
  cost          numeric not null default 0,
  price         numeric not null default 0,
  tax_rate      numeric not null default 0,
  min_stock     numeric not null default 0,
  brand         text not null default '',
  model         text not null default '',
  barcode       text not null default '',
  fits_item_ids text[] not null default '{}',
  notes         text not null default '',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index items_sku_key on erp.items (lower(sku));

create table erp.warehouses (
  id         text primary key,
  name_ar    text not null,
  name_tr    text not null default '',
  location   text not null default '',
  is_default boolean not null default false,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Parties. Customers and suppliers share a shape but not a table: a clinic
-- that also sells you something is two records with two balances.
-- ---------------------------------------------------------------------

create table erp.customers (
  id             text primary key,
  code           text not null default '',
  name           text not null,
  kind           text not null check (kind in ('clinic','hospital','lab','dealer','other')),
  contact_person text not null default '',
  phone          text not null default '',
  email          text not null default '',
  address        text not null default '',
  city           text not null default '',
  tax_number     text not null default '',
  credit_limit   numeric not null default 0,
  notes          text not null default '',
  active         boolean not null default true,
  billing_region text check (billing_region in ('TR','SY')),
  turkey         jsonb,
  syria          jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table erp.suppliers (like erp.customers including all);

-- ---------------------------------------------------------------------
-- Stock ledger. Append-only: on-hand is the sum of qty_delta, so a changed
-- or deleted row would silently rewrite history. Corrections are opposing
-- moves. Enforced here, not just by convention in the app.
-- ---------------------------------------------------------------------

create table erp.stock_moves (
  id           text primary key,
  date         date not null,
  item_id      text not null references erp.items (id) deferrable initially deferred,
  warehouse_id text not null references erp.warehouses (id) deferrable initially deferred,
  qty_delta    numeric not null check (qty_delta <> 0),
  type         text not null check (type in ('opening','purchase','sale','service','transfer','adjustment','return')),
  ref_type     text not null check (ref_type in ('purchase_order','sales_invoice','service_job','transfer','manual')),
  ref_id       text,
  unit_cost    numeric not null default 0,
  note         text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index stock_moves_item_idx on erp.stock_moves (item_id, warehouse_id);
create index stock_moves_ref_idx on erp.stock_moves (ref_type, ref_id);

create function erp.stock_moves_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'stock_moves is append-only: write an opposing move instead of % on %',
    tg_op, coalesce(old.id, '?')
    using errcode = 'restrict_violation';
end $$;

create trigger stock_moves_no_update before update or delete on erp.stock_moves
  for each row execute function erp.stock_moves_append_only();
create trigger stock_moves_no_truncate before truncate on erp.stock_moves
  for each statement execute function erp.stock_moves_append_only();

-- ---------------------------------------------------------------------
-- Documents. Lines live in child tables, ordered by `position`, so a report
-- can sum line values in SQL without unpacking JSON.
-- ---------------------------------------------------------------------

create table erp.sales_invoices (
  id             text primary key,
  number         text not null unique,
  date           date not null,
  due_date       date not null,
  customer_id    text not null references erp.customers (id) deferrable initially deferred,
  warehouse_id   text not null references erp.warehouses (id) deferrable initially deferred,
  currency       text not null,
  fx_rate        numeric not null default 1 check (fx_rate > 0),
  status         text not null check (status in ('draft','issued','partial','paid','void')),
  discount_kind  text not null check (discount_kind in ('percent','amount')),
  discount_value numeric not null default 0,
  notes          text not null default '',
  issued_at      timestamptz,
  billing_region text check (billing_region in ('TR','SY')),
  document_type  text check (document_type in ('fatura','e_fatura','e_arsiv','e_irsaliye','export')),
  dispatch       jsonb,
  local_rate     numeric,
  local_currency text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index sales_invoices_customer_idx on erp.sales_invoices (customer_id);

create table erp.sales_invoice_lines (
  id               text primary key,
  invoice_id       text not null references erp.sales_invoices (id) on delete cascade deferrable initially deferred,
  position         integer not null,
  item_id          text references erp.items (id) deferrable initially deferred,
  description      text not null default '',
  qty              numeric not null check (qty > 0),
  unit_price       numeric not null default 0,
  discount_percent numeric not null default 0,
  tax_rate         numeric not null default 0
);
create index sales_invoice_lines_invoice_idx on erp.sales_invoice_lines (invoice_id, position);

create table erp.service_jobs (
  id              text primary key,
  number          text not null unique,
  date            date not null,
  customer_id     text not null references erp.customers (id) deferrable initially deferred,
  machine_item_id text references erp.items (id) deferrable initially deferred,
  machine_label   text not null default '',
  serial_no       text not null default '',
  reported_fault  text not null default '',
  diagnosis       text not null default '',
  status          text not null check (status in ('received','diagnosed','awaiting_parts','in_progress','done','delivered')),
  technician_id   text references erp.users (id) deferrable initially deferred,
  labor_charge    numeric not null default 0,
  under_warranty  boolean not null default false,
  notes           text not null default '',
  closed_at       timestamptz,
  -- Deleting the draft invoice raised from a job leaves the job un-billed,
  -- not orphaned.
  invoice_id      text references erp.sales_invoices (id) on delete set null deferrable initially deferred,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table erp.service_job_parts (
  id           text primary key,
  job_id       text not null references erp.service_jobs (id) on delete cascade deferrable initially deferred,
  position     integer not null,
  item_id      text not null references erp.items (id) deferrable initially deferred,
  qty          numeric not null check (qty > 0),
  unit_price   numeric not null default 0,
  warehouse_id text not null references erp.warehouses (id) deferrable initially deferred,
  consumed     boolean not null default false
);
create index service_job_parts_job_idx on erp.service_job_parts (job_id, position);

create table erp.purchase_orders (
  id             text primary key,
  number         text not null unique,
  date           date not null,
  expected_date  date not null,
  supplier_id    text not null references erp.suppliers (id) deferrable initially deferred,
  warehouse_id   text not null references erp.warehouses (id) deferrable initially deferred,
  currency       text not null,
  fx_rate        numeric not null default 1 check (fx_rate > 0),
  status         text not null check (status in ('draft','ordered','partial','received','cancelled')),
  discount_kind  text not null check (discount_kind in ('percent','amount')),
  discount_value numeric not null default 0,
  notes          text not null default '',
  received_at    timestamptz,
  service_job_id text references erp.service_jobs (id) on delete set null deferrable initially deferred,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index purchase_orders_supplier_idx on erp.purchase_orders (supplier_id);

create table erp.purchase_order_lines (
  id               text primary key,
  order_id         text not null references erp.purchase_orders (id) on delete cascade deferrable initially deferred,
  position         integer not null,
  item_id          text references erp.items (id) deferrable initially deferred,
  description      text not null default '',
  qty              numeric not null check (qty > 0),
  unit_price       numeric not null default 0,
  discount_percent numeric not null default 0,
  tax_rate         numeric not null default 0
);
create index purchase_order_lines_order_idx on erp.purchase_order_lines (order_id, position);

-- ---------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------

create table erp.payments (
  id         text primary key,
  date       date not null,
  direction  text not null check (direction in ('in','out')),
  party_type text not null check (party_type in ('customer','supplier')),
  -- Polymorphic (customer or supplier by party_type), so no foreign key.
  party_id   text not null,
  invoice_id text references erp.sales_invoices (id) on delete set null deferrable initially deferred,
  amount     numeric not null check (amount > 0),
  currency   text not null,
  fx_rate    numeric not null default 1 check (fx_rate > 0),
  method     text not null check (method in ('cash','bank','cheque','card')),
  reference  text not null default '',
  note       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_party_idx on erp.payments (party_type, party_id);
create index payments_invoice_idx on erp.payments (invoice_id);

create table erp.expenses (
  id          text primary key,
  date        date not null,
  category    text not null check (category in ('rent','salaries','utilities','shipping','marketing','maintenance','other')),
  amount      numeric not null check (amount > 0),
  currency    text not null,
  fx_rate     numeric not null default 1 check (fx_rate > 0),
  method      text not null check (method in ('cash','bank','cheque','card')),
  description text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Version triggers, RLS and grants, applied uniformly to every data table.
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'settings','users','categories','items','warehouses','customers','suppliers',
    'stock_moves','sales_invoices','sales_invoice_lines','service_jobs',
    'service_job_parts','purchase_orders','purchase_order_lines','payments','expenses'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on erp.%I
         for each statement execute function erp.bump_version()',
      t || '_bump_version', t);
    insert into erp.table_versions (table_name, version) values (t, 0);

    execute format('alter table erp.%I enable row level security', t);
    execute format(
      'create policy %I on erp.%I for all to dentec_app using (true) with check (true)',
      t || '_app', t);
    execute format('revoke all on erp.%I from public', t);
    execute format('grant select, insert, update, delete on erp.%I to dentec_app', t);
  end loop;
end $$;

-- The ledger takes inserts only, at the privilege level too.
revoke update, delete, truncate on erp.stock_moves from dentec_app;

alter table erp.table_versions enable row level security;
create policy table_versions_app_read on erp.table_versions for select to dentec_app using (true);
revoke all on erp.table_versions from public;
grant select on erp.table_versions to dentec_app;

-- ---------------------------------------------------------------------
-- The starting state: no sample data, just what the app cannot run without
-- — company settings to fill in, and one warehouse to receive stock into.
-- ---------------------------------------------------------------------

insert into erp.settings (id, data) values (1, jsonb_build_object(
  'companyName', 'دينتك',
  'companyNameTr', 'Dentec',
  'address', '',
  'phone', '',
  'email', '',
  'taxNumber', '',
  'baseCurrency', 'USD',
  'currencies', jsonb_build_array(jsonb_build_object('code', 'USD', 'rate', 1)),
  'defaultTaxRate', 20,
  'lowStockDefault', 3,
  'invoicePrefix', 'INV',
  'purchasePrefix', 'PO',
  'servicePrefix', 'SRV'
));

insert into erp.warehouses (id, name_ar, name_tr, location, is_default, active)
values ('wh-main', 'المستودع الرئيسي', 'Ana Depo', '', true, true);

commit;
