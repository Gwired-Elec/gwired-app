-- G|Wired 005: estimating data (suppliers, materials with several supplier prices, labour / point rates, assemblies,
-- prelims, estimating defaults, saved import column maps). Run once after 001-004. Never re-run.
--
-- Money is whole pence. Material prices carry "per_qty" (price per 1 / 10 / 100 / 1000 units, as wholesalers quote cable and
-- fixings), so a price of 23.4p a metre is stored as 234 pence per 10. Cost per unit = cost_pence / per_qty.
-- All of this needs the estimates.view permission to read and estimates.edit to change, so an Operative's device
-- never receives prices. (Hiding cost from someone who can see sell prices is done on screen with estimates.view_cost.)

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);

create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  code text,
  description text not null,
  category text,
  unit text not null default 'each',
  labour_hours numeric(10, 3),                 -- hours to fit one unit (the industry-standard "labour unit")
  markup_pct numeric(6, 2),                    -- empty = use the default markup
  preferred_supplier_id uuid references suppliers (id),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists materials_code on materials (code);

create table if not exists material_prices (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials (id),
  supplier_id uuid not null references suppliers (id),
  supplier_code text,
  list_pence bigint,                           -- list price for per_qty units (information)
  discount_pct numeric(6, 2),                  -- your discount off list (information)
  cost_pence bigint not null,                  -- what you pay for per_qty units, after discount
  per_qty int not null default 1 check (per_qty > 0),
  price_date date not null default current_date,
  source text,                                 -- e.g. the price file it came from
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists material_prices_material on material_prices (material_id);

create table if not exists labour_rates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cost_per_hour_pence bigint not null default 0,
  charge_per_hour_pence bigint not null default 0,
  day_rate_pence bigint not null default 0,    -- what you charge per person per day
  day_cost_pence bigint not null default 0,    -- what a person per day costs you
  overtime_multiplier numeric(4, 2) not null default 1.5,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);

create table if not exists point_rates (
  id uuid primary key default gen_random_uuid(),
  name text not null,                          -- e.g. "Double socket (first fix + second fix)"
  category text,
  unit text not null default 'point',
  sell_pence bigint not null default 0,        -- fixed price you charge per point
  cost_pence bigint not null default 0,        -- what a point costs you (for margin)
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);

create table if not exists assemblies (
  id uuid primary key default gen_random_uuid(),
  code text,
  name text not null,
  category text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create table if not exists assembly_items (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references assemblies (id),
  material_id uuid not null references materials (id),
  qty numeric(10, 3) not null default 1,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
-- an assembly's labour = the labour units of its materials plus any extra hours entered on the assembly itself
alter table assemblies add column if not exists extra_labour_hours numeric(10, 3) not null default 0;
create index if not exists assembly_items_assembly on assembly_items (assembly_id);

create table if not exists prelim_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,                          -- access equipment, waste, welfare, parking, testing, O&M manuals ...
  kind text not null default 'fixed' check (kind in ('fixed', 'percent')),
  amount_pence bigint not null default 0,      -- used when kind = fixed
  percent numeric(6, 2) not null default 0,    -- used when kind = percent (of the job's direct cost)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);

-- one row of estimating defaults (a fixed id so every device agrees which row it is)
create table if not exists estimating_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000001',
  default_markup_pct numeric(6, 2) not null default 20,   -- on material cost, when a material has no markup of its own
  oh_pct numeric(6, 2) not null default 10,
  profit_pct numeric(6, 2) not null default 10,
  contingency_pct numeric(6, 2) not null default 0,
  stale_days int not null default 180,                    -- a price older than this (about 6 months) is flagged, and warns when added to an estimate
  vat_rate numeric(6, 2) not null default 20,
  method_defaults jsonb not null default '{"domestic":"point","commercial":"units","industrial":"units","eicr":"day","testing":"day","maintenance":"day"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb,
  check (id = '00000000-0000-0000-0000-000000000001')
);

-- saved column maps for price-file imports, one per supplier, so the second import is one click
create table if not exists import_mappings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers (id),
  mapping jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);

do $$
declare t text;
begin
  foreach t in array array['suppliers', 'materials', 'material_prices', 'labour_rates', 'point_rates', 'assemblies', 'assembly_items', 'prelim_items', 'estimating_settings', 'import_mappings'] loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated', t);
    execute format('alter table %I enable row level security', t);
    if t <> 'estimating_settings' then
      execute format('create policy %I on %I for select to authenticated using (has_perm(''estimates.view''))', 'view ' || t, t);
      execute format('create policy %I on %I for insert to authenticated with check (has_perm(''estimates.edit''))', 'add ' || t, t);
      execute format('create policy %I on %I for update to authenticated using (has_perm(''estimates.edit'')) with check (has_perm(''estimates.edit''))', 'edit ' || t, t);
    end if;
  end loop;
end $$;
create policy "view estimating settings" on estimating_settings for select to authenticated using (has_perm('estimates.view'));
create policy "edit estimating settings" on estimating_settings for update to authenticated using (has_perm('settings')) with check (has_perm('settings'));

-- which columns sync; money fields are protected (never silently overwritten)
insert into sync_tables (table_name, columns, protected) values
  ('suppliers', array['name','notes','active','deleted_at'], '{}'),
  ('materials', array['code','description','category','unit','labour_hours','markup_pct','preferred_supplier_id','active','notes','deleted_at'], '{}'),
  ('material_prices', array['material_id','supplier_id','supplier_code','list_pence','discount_pct','cost_pence','per_qty','price_date','source','deleted_at'], array['cost_pence']),
  ('labour_rates', array['name','cost_per_hour_pence','charge_per_hour_pence','day_rate_pence','day_cost_pence','overtime_multiplier','sort','active','deleted_at'], array['cost_per_hour_pence','charge_per_hour_pence','day_rate_pence','day_cost_pence']),
  ('point_rates', array['name','category','unit','sell_pence','cost_pence','notes','active','deleted_at'], array['sell_pence','cost_pence']),
  ('assemblies', array['code','name','category','description','extra_labour_hours','active','deleted_at'], '{}'),
  ('assembly_items', array['assembly_id','material_id','qty','sort','deleted_at'], '{}'),
  ('prelim_items', array['name','kind','amount_pence','percent','active','deleted_at'], array['amount_pence']),
  ('estimating_settings', array['default_markup_pct','oh_pct','profit_pct','contingency_pct','stale_days','vat_rate','method_defaults'], '{}'),
  ('import_mappings', array['supplier_id','mapping','deleted_at'], '{}')
on conflict (table_name) do update set columns = excluded.columns, protected = excluded.protected;

-- starting data (rates are left at 0 on purpose: set your own)
insert into estimating_settings (id) values ('00000000-0000-0000-0000-000000000001') on conflict do nothing;
insert into suppliers (name) select n from (values ('Rexel'), ('TLC Direct'), ('Priced on jobs')) v(n) where not exists (select 1 from suppliers);
insert into labour_rates (name, sort)
select n, s from (values ('Approved Electrician', 10), ('Electrician', 20), ('Mate / Improver', 30), ('Apprentice', 40), ('Labourer', 50), ('Supervisor', 60), ('Tester', 70)) v(n, s)
where not exists (select 1 from labour_rates);
