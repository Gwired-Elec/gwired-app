-- G|Wired 008: estimates (the estimate builder). Run once after 007. Never re-run.
-- A job has one or more estimate REVISIONS (A, B, C ...). Each has sections, and sections have lines.
-- Every line holds its own copy of the cost and sell price (so an old estimate never changes when a price list does),
-- plus the date of the price it was built on, so its age can still be shown.
-- Same rules as the rest of estimating: estimates.view to read, estimates.edit to change.

create table if not exists estimates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id),
  rev int not null default 1,                    -- 1 = A, 2 = B ...
  name text,
  status text not null default 'draft' check (status in ('draft', 'issued', 'accepted', 'superseded')),
  method text not null default 'units' check (method in ('units', 'point', 'day')),   -- how new lines are priced by default
  labour_rate_id uuid references labour_rates (id),                                    -- default labour grade for new lines
  oh_pct numeric(6, 2) not null default 0,
  profit_pct numeric(6, 2) not null default 0,
  contingency_pct numeric(6, 2) not null default 0,
  discount_pct numeric(6, 2) not null default 0,
  vat_rate numeric(6, 2) not null default 20,
  reverse_charge boolean not null default false, -- domestic reverse charge: no VAT shown, customer accounts for it
  notes text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists estimates_job on estimates (job_id);

create table if not exists estimate_sections (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references estimates (id),
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists estimate_sections_estimate on estimate_sections (estimate_id);

create table if not exists estimate_lines (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references estimates (id),
  section_id uuid references estimate_sections (id),
  sort int not null default 0,
  kind text not null default 'item' check (kind in ('material', 'point', 'day', 'prelim', 'item')),
  description text not null,
  qty numeric(12, 3) not null default 1,
  unit text not null default 'each',
  material_id uuid references materials (id),
  point_rate_id uuid references point_rates (id),
  labour_rate_id uuid references labour_rates (id),
  unit_cost numeric(14, 4) not null default 0,   -- pence per unit, can be fractional (23.4p a metre)
  unit_sell numeric(14, 4) not null default 0,
  hours_per_unit numeric(10, 3) not null default 0,
  labour_cost_hr_pence bigint not null default 0,
  labour_charge_hr_pence bigint not null default 0,
  markup_pct numeric(6, 2),
  price_date date,                               -- when the price this line is built on was checked
  price_source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists estimate_lines_estimate on estimate_lines (estimate_id);

do $$
declare t text;
begin
  foreach t in array array['estimates', 'estimate_sections', 'estimate_lines'] loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to authenticated using (has_perm(''estimates.view''))', 'view ' || t, t);
    execute format('create policy %I on %I for insert to authenticated with check (has_perm(''estimates.edit''))', 'add ' || t, t);
    execute format('create policy %I on %I for update to authenticated using (has_perm(''estimates.edit'')) with check (has_perm(''estimates.edit''))', 'edit ' || t, t);
  end loop;
end $$;

insert into sync_tables (table_name, columns, protected) values
  ('estimates', array['job_id','rev','name','status','method','labour_rate_id','oh_pct','profit_pct','contingency_pct','discount_pct','vat_rate','reverse_charge','notes','issued_at','deleted_at'], '{}'),
  ('estimate_sections', array['estimate_id','name','sort','deleted_at'], '{}'),
  ('estimate_lines', array['estimate_id','section_id','sort','kind','description','qty','unit','material_id','point_rate_id','labour_rate_id','unit_cost','unit_sell','hours_per_unit','labour_cost_hr_pence','labour_charge_hr_pence','markup_pct','price_date','price_source','notes','deleted_at'], '{}')
on conflict (table_name) do update set columns = excluded.columns, protected = excluded.protected;
