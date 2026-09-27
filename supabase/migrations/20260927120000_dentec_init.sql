-- =====================================================================
-- Dentec ERP — initial schema
--
-- Apply once, in Supabase Studio → SQL Editor, or with
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/20260927120000_dentec_init.sql
--
-- What lives here:
--   * one table per collection in src/lib/data/types.ts
--   * row-level security mirroring src/lib/permissions.ts
--   * get_snapshot()  — everything the caller may see, in one round trip
--   * apply_changes() — one transactional, version-checked write
--   * stock_moves is append-only, enforced by trigger
--
-- The file is idempotent where Postgres allows it, so re-running it on a
-- half-applied database is safe.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Singletons
-- ---------------------------------------------------------------------

create table if not exists public.app_settings (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict do nothing;

-- Bumped by every write. apply_changes() refuses a write made against an
-- older version, which is how two users editing at once cannot lose data.
create table if not exists public.app_meta (
  id          int primary key default 1 check (id = 1),
  version     bigint not null default 0,
  setup_done  boolean not null default false
);
insert into public.app_meta (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  name                  text not null default '',
  email                 text not null default '',
  phone                 text not null default '',
  role                  text not null check (role in ('owner', 'accounting', 'service')),
  active                boolean not null default true,
  must_change_password  boolean not null default false,
  tour_completed_at     timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Catalog and stock
-- ---------------------------------------------------------------------

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name_ar     text not null default '',
  name_tr     text not null default '',
  parent_id   uuid,
  applies_to  text not null default 'both' check (applies_to in ('product', 'spare_part', 'both')),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.items (
  id             uuid primary key default gen_random_uuid(),
  sku            text not null default '',
  name_ar        text not null default '',
  name_tr        text not null default '',
  item_type      text not null check (item_type in ('product', 'spare_part')),
  category_id    uuid,
  unit           text not null default 'piece',
  cost           numeric not null default 0,
  price          numeric not null default 0,
  tax_rate       numeric not null default 0,
  min_stock      numeric not null default 0,
  brand          text not null default '',
  model          text not null default '',
  barcode        text not null default '',
  fits_item_ids  jsonb not null default '[]'::jsonb,
  notes          text not null default '',
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.warehouses (
  id          uuid primary key default gen_random_uuid(),
  name_ar     text not null default '',
  name_tr     text not null default '',
  location    text not null default '',
  is_default  boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Append-only ledger. On-hand is always the sum of qty_delta.
create table if not exists public.stock_moves (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  item_id       uuid not null,
  warehouse_id  uuid not null,
  qty_delta     numeric not null,
  type          text not null check (type in ('opening', 'purchase', 'sale', 'service', 'transfer', 'adjustment', 'return')),
  ref_type      text not null check (ref_type in ('purchase_order', 'sales_invoice', 'service_job', 'transfer', 'manual')),
  ref_id        text,
  unit_cost     numeric not null default 0,
  note          text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Parties
-- ---------------------------------------------------------------------

create table if not exists public.customers (
  id              uuid primary key default gen_random_uuid(),
  code            text not null default '',
  name            text not null default '',
  kind            text not null default 'other' check (kind in ('clinic', 'hospital', 'lab', 'dealer', 'other')),
  contact_person  text not null default '',
  phone           text not null default '',
  email           text not null default '',
  address         text not null default '',
  city            text not null default '',
  tax_number      text not null default '',
  credit_limit    numeric not null default 0,
  notes           text not null default '',
  active          boolean not null default true,
  billing_region  text check (billing_region in ('TR', 'SY')),
  turkey          jsonb,
  syria           jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.suppliers (like public.customers including all);

-- ---------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------

create table if not exists public.sales_invoices (
  id              uuid primary key default gen_random_uuid(),
  number          text not null,
  date            date not null,
  due_date        date,
  customer_id     uuid not null,
  warehouse_id    uuid not null,
  currency        text not null,
  fx_rate         numeric not null default 1,
  status          text not null check (status in ('draft', 'issued', 'partial', 'paid', 'void')),
  discount_kind   text not null default 'percent' check (discount_kind in ('percent', 'amount')),
  discount_value  numeric not null default 0,
  lines           jsonb not null default '[]'::jsonb,
  notes           text not null default '',
  issued_at       timestamptz,
  billing_region  text check (billing_region in ('TR', 'SY')),
  document_type   text check (document_type in ('fatura', 'e_fatura', 'e_arsiv', 'e_irsaliye', 'export')),
  dispatch        jsonb,
  local_rate      numeric,
  local_currency  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint sales_invoices_number_key unique (number)
);

create table if not exists public.purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  number          text not null,
  date            date not null,
  expected_date   date,
  supplier_id     uuid not null,
  warehouse_id    uuid not null,
  currency        text not null,
  fx_rate         numeric not null default 1,
  status          text not null check (status in ('draft', 'ordered', 'partial', 'received', 'cancelled')),
  discount_kind   text not null default 'percent' check (discount_kind in ('percent', 'amount')),
  discount_value  numeric not null default 0,
  lines           jsonb not null default '[]'::jsonb,
  notes           text not null default '',
  received_at     timestamptz,
  service_job_id  uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint purchase_orders_number_key unique (number)
);

create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  direction   text not null check (direction in ('in', 'out')),
  party_type  text not null check (party_type in ('customer', 'supplier')),
  party_id    uuid not null,
  invoice_id  uuid,
  amount      numeric not null,
  currency    text not null,
  fx_rate     numeric not null default 1,
  method      text not null check (method in ('cash', 'bank', 'cheque', 'card')),
  reference   text not null default '',
  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  date         date not null,
  category     text not null check (category in ('rent', 'salaries', 'utilities', 'shipping', 'marketing', 'maintenance', 'other')),
  amount       numeric not null,
  currency     text not null,
  fx_rate      numeric not null default 1,
  method       text not null check (method in ('cash', 'bank', 'cheque', 'card')),
  description  text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.service_jobs (
  id              uuid primary key default gen_random_uuid(),
  number          text not null,
  date            date not null,
  customer_id     uuid not null,
  machine_item_id uuid,
  machine_label   text not null default '',
  serial_no       text not null default '',
  reported_fault  text not null default '',
  diagnosis       text not null default '',
  status          text not null check (status in ('received', 'diagnosed', 'awaiting_parts', 'in_progress', 'done', 'delivered')),
  technician_id   uuid,
  labor_charge    numeric not null default 0,
  under_warranty  boolean not null default false,
  parts           jsonb not null default '[]'::jsonb,
  notes           text not null default '',
  closed_at       timestamptz,
  invoice_id      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint service_jobs_number_key unique (number)
);

-- ---------------------------------------------------------------------
-- Foreign keys
--
-- All DEFERRABLE INITIALLY DEFERRED: apply_changes() writes a whole change
-- set in one transaction, and a parent and its child can arrive in either
-- order (a category and its sub-category, a job and the order drafted for
-- it). The check still happens — at commit.
-- ---------------------------------------------------------------------

do $$
declare
  fk record;
begin
  for fk in
    select * from (values
      ('categories',      'categories_parent_fk',      'parent_id',       'categories',     'set null'),
      ('items',           'items_category_fk',         'category_id',     'categories',     'set null'),
      ('stock_moves',     'stock_moves_item_fk',       'item_id',         'items',          'restrict'),
      ('stock_moves',     'stock_moves_warehouse_fk',  'warehouse_id',    'warehouses',     'restrict'),
      ('sales_invoices',  'sales_invoices_customer_fk','customer_id',     'customers',      'restrict'),
      ('sales_invoices',  'sales_invoices_wh_fk',      'warehouse_id',    'warehouses',     'restrict'),
      ('purchase_orders', 'purchase_orders_supplier_fk','supplier_id',    'suppliers',      'restrict'),
      ('purchase_orders', 'purchase_orders_wh_fk',     'warehouse_id',    'warehouses',     'restrict'),
      ('purchase_orders', 'purchase_orders_job_fk',    'service_job_id',  'service_jobs',   'set null'),
      ('service_jobs',    'service_jobs_customer_fk',  'customer_id',     'customers',      'restrict'),
      ('service_jobs',    'service_jobs_machine_fk',   'machine_item_id', 'items',          'set null'),
      ('service_jobs',    'service_jobs_tech_fk',      'technician_id',   'profiles',       'set null'),
      ('service_jobs',    'service_jobs_invoice_fk',   'invoice_id',      'sales_invoices', 'set null')
    ) as t(tbl, name, col, ref, on_delete)
  loop
    if not exists (select 1 from pg_constraint where conname = fk.name) then
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references public.%I (id) on delete %s deferrable initially deferred',
        fk.tbl, fk.name, fk.col, fk.ref, fk.on_delete
      );
    end if;
  end loop;
end $$;

create index if not exists stock_moves_item_idx      on public.stock_moves (item_id);
create index if not exists sales_invoices_cust_idx   on public.sales_invoices (customer_id);
create index if not exists purchase_orders_supp_idx  on public.purchase_orders (supplier_id);
create index if not exists payments_party_idx        on public.payments (party_id);
create index if not exists service_jobs_cust_idx     on public.service_jobs (customer_id);

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------

-- The caller's role, or NULL for anyone without an active profile — which
-- includes an account someone created through a public sign-up form. NULL
-- matches no policy below, so such an account sees nothing.
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.has_role(variadic roles text[])
returns boolean
language sql
stable
as $$
  select coalesce(public.app_role() = any (roles), false)
$$;

-- ---------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------

create or replace function public.stock_moves_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'stock_moves is append-only: correct a move with an opposing move'
    using errcode = '42501';
end $$;

drop trigger if exists stock_moves_append_only on public.stock_moves;
create trigger stock_moves_append_only
  before update or delete on public.stock_moves
  for each row execute function public.stock_moves_append_only();

-- Anyone may update their own profile (walkthrough flag, name, phone), but
-- only an owner changes a role, an email or whether an account is active —
-- and no one may remove the last active owner.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and coalesce(public.app_role(), '') <> 'owner'
     and auth.uid() is not null
     and (new.role is distinct from old.role
          or new.active is distinct from old.active
          or new.email is distinct from old.email) then
    raise exception 'only an owner can change roles, e-mail or access' using errcode = '42501';
  end if;

  if old.role = 'owner' and old.active
     and (tg_op = 'DELETE' or new.role <> 'owner' or not new.active)
     and not exists (
       select 1 from public.profiles
       where role = 'owner' and active and id <> old.id
     ) then
    raise exception 'dentec_last_owner' using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update or delete on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------
-- Row-level security — mirrors src/lib/permissions.ts
-- ---------------------------------------------------------------------

alter table public.app_settings    enable row level security;
alter table public.app_meta        enable row level security;
alter table public.profiles        enable row level security;
alter table public.categories      enable row level security;
alter table public.items           enable row level security;
alter table public.warehouses      enable row level security;
alter table public.stock_moves     enable row level security;
alter table public.customers       enable row level security;
alter table public.suppliers       enable row level security;
alter table public.sales_invoices  enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.payments        enable row level security;
alter table public.expenses        enable row level security;
alter table public.service_jobs    enable row level security;

do $$
declare
  p record;
begin
  -- Drop every policy this file owns, then recreate: re-running stays clean.
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and policyname like 'dentec_%'
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- Settings and the version counter: everyone signed in reads them.
create policy dentec_read   on public.app_settings for select using (public.app_role() is not null);
create policy dentec_owner  on public.app_settings for update using (public.has_role('owner'));
create policy dentec_read   on public.app_meta     for select using (public.app_role() is not null);
create policy dentec_bump   on public.app_meta     for update using (public.app_role() is not null);

-- Profiles: names are needed everywhere (technician on a job). Accounts are
-- created by the server with the service-role key, never through RLS.
create policy dentec_read   on public.profiles for select using (public.app_role() is not null);
create policy dentec_owner  on public.profiles for update using (public.has_role('owner'));
create policy dentec_self   on public.profiles for update using (id = auth.uid());
create policy dentec_delete on public.profiles for delete using (public.has_role('owner'));

-- Catalog, warehouses: everyone reads, the office edits.
create policy dentec_read   on public.categories for select using (public.app_role() is not null);
create policy dentec_write  on public.categories for all
  using (public.has_role('owner', 'accounting')) with check (public.has_role('owner', 'accounting'));
create policy dentec_read   on public.items for select using (public.app_role() is not null);
create policy dentec_write  on public.items for all
  using (public.has_role('owner', 'accounting')) with check (public.has_role('owner', 'accounting'));
create policy dentec_read   on public.warehouses for select using (public.app_role() is not null);
create policy dentec_write  on public.warehouses for all
  using (public.has_role('owner', 'accounting')) with check (public.has_role('owner', 'accounting'));

-- Stock ledger: everyone reads, everyone appends (a technician consuming a
-- part writes a move). No update or delete policy exists — and the trigger
-- above refuses them even for the service role.
create policy dentec_read   on public.stock_moves for select using (public.app_role() is not null);
create policy dentec_append on public.stock_moves for insert with check (public.app_role() is not null);

-- Customers: everyone reads and edits, the office deletes.
create policy dentec_read   on public.customers for select using (public.app_role() is not null);
create policy dentec_insert on public.customers for insert with check (public.app_role() is not null);
create policy dentec_update on public.customers for update using (public.app_role() is not null);
create policy dentec_delete on public.customers for delete using (public.has_role('owner', 'accounting'));

-- Money: the office only. Service staff cannot read a single row.
create policy dentec_office on public.suppliers for all
  using (public.has_role('owner', 'accounting')) with check (public.has_role('owner', 'accounting'));
create policy dentec_office on public.sales_invoices for all
  using (public.has_role('owner', 'accounting')) with check (public.has_role('owner', 'accounting'));
create policy dentec_office on public.purchase_orders for all
  using (public.has_role('owner', 'accounting')) with check (public.has_role('owner', 'accounting'));
create policy dentec_office on public.payments for all
  using (public.has_role('owner', 'accounting')) with check (public.has_role('owner', 'accounting'));
create policy dentec_office on public.expenses for all
  using (public.has_role('owner', 'accounting')) with check (public.has_role('owner', 'accounting'));

-- Service jobs: everyone reads; owner and service open and close them; the
-- office also updates one when it raises the invoice for it.
create policy dentec_read   on public.service_jobs for select using (public.app_role() is not null);
create policy dentec_insert on public.service_jobs for insert with check (public.has_role('owner', 'service'));
create policy dentec_update on public.service_jobs for update using (public.app_role() is not null);
create policy dentec_delete on public.service_jobs for delete using (public.has_role('owner', 'service'));

-- ---------------------------------------------------------------------
-- get_snapshot(): everything the caller may see, in one round trip.
-- SECURITY INVOKER, so every sub-select runs under the policies above.
-- ---------------------------------------------------------------------

create or replace function public.get_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'version',         (select version from app_meta where id = 1),
    'settings',        (select data || jsonb_build_object('updatedAt', updated_at) from app_settings where id = 1),
    'profiles',        coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from profiles t), '[]'::jsonb),
    'categories',      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from categories t), '[]'::jsonb),
    'items',           coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from items t), '[]'::jsonb),
    'warehouses',      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from warehouses t), '[]'::jsonb),
    'stock_moves',     coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from stock_moves t), '[]'::jsonb),
    'customers',       coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from customers t), '[]'::jsonb),
    'suppliers',       coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from suppliers t), '[]'::jsonb),
    'sales_invoices',  coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from sales_invoices t), '[]'::jsonb),
    'purchase_orders', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from purchase_orders t), '[]'::jsonb),
    'payments',        coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from payments t), '[]'::jsonb),
    'expenses',        coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from expenses t), '[]'::jsonb),
    'service_jobs',    coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from service_jobs t), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------
-- apply_changes(): one version-checked, all-or-nothing write.
--
-- p_changes = {
--   "settings": { ...Settings },                      -- optional
--   "<table>":  { "insert": [row], "update": [row], "delete": [id] }
-- }
-- Rows use column names. SECURITY INVOKER: every statement is still subject
-- to the policies above; an update or delete that RLS hides touches zero rows
-- and is reported as forbidden rather than silently ignored.
-- ---------------------------------------------------------------------

create or replace function public.apply_changes(p_expected bigint, p_changes jsonb)
returns bigint
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  -- Parents before children for inserts and updates; reversed for deletes.
  v_tables  text[] := array[
    'profiles', 'categories', 'warehouses', 'items', 'customers', 'suppliers',
    'service_jobs', 'sales_invoices', 'purchase_orders', 'payments', 'expenses', 'stock_moves'
  ];
  v_table   text;
  v_cols    text;
  v_row     jsonb;
  v_n       int;
  v_version bigint;
  i         int;
begin
  if public.app_role() is null then
    raise exception 'dentec_forbidden' using errcode = '42501';
  end if;

  -- The row lock serialises writers; the comparison rejects a stale snapshot.
  select version into v_version from app_meta where id = 1 for update;
  if v_version is distinct from p_expected then
    raise exception 'dentec_conflict' using errcode = '40001';
  end if;

  if p_changes ? 'settings' then
    update app_settings set data = p_changes -> 'settings', updated_at = now() where id = 1;
    get diagnostics v_n = row_count;
    if v_n = 0 then raise exception 'dentec_forbidden: settings' using errcode = '42501'; end if;
  end if;

  foreach v_table in array v_tables loop
    continue when not (p_changes ? v_table);

    select string_agg(quote_ident(attname), ', ' order by attnum)
      into v_cols
      from pg_attribute
     where attrelid = format('public.%I', v_table)::regclass
       and attnum > 0 and not attisdropped
       and attname not in ('id', 'created_at');

    for v_row in select value from jsonb_array_elements(coalesce(p_changes -> v_table -> 'insert', '[]'::jsonb)) loop
      execute format(
        'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
        v_table, v_table
      ) using v_row;
    end loop;

    for v_row in select value from jsonb_array_elements(coalesce(p_changes -> v_table -> 'update', '[]'::jsonb)) loop
      execute format(
        'update public.%I t set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1) r) where t.id = ($1 ->> ''id'')::uuid',
        v_table, v_cols, v_cols, v_table
      ) using v_row;
      get diagnostics v_n = row_count;
      if v_n = 0 then
        raise exception 'dentec_forbidden: update %', v_table using errcode = '42501';
      end if;
    end loop;
  end loop;

  for i in reverse array_length(v_tables, 1) .. 1 loop
    v_table := v_tables[i];
    continue when not (p_changes ? v_table);
    for v_row in select value from jsonb_array_elements(coalesce(p_changes -> v_table -> 'delete', '[]'::jsonb)) loop
      execute format('delete from public.%I where id = ($1 #>> ''{}'')::uuid', v_table) using v_row;
      get diagnostics v_n = row_count;
      if v_n = 0 then
        raise exception 'dentec_forbidden: delete %', v_table using errcode = '42501';
      end if;
    end loop;
  end loop;

  update app_meta set version = version + 1 where id = 1 returning version into v_version;
  return v_version;
end $$;

-- ---------------------------------------------------------------------
-- Grants. Nothing for anon: an anonymous request reads and writes nothing.
-- ---------------------------------------------------------------------

revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon, public;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

grant execute on function public.app_role()                    to authenticated, service_role;
grant execute on function public.has_role(text[])              to authenticated, service_role;
grant execute on function public.get_snapshot()                to authenticated;
grant execute on function public.apply_changes(bigint, jsonb)  to authenticated;
