-- G|Wired 017: variations, applications for payment and simple invoices (Phase 5). Run once after 016. Safe to run twice.
-- Money is held in whole pence (bigint). Anyone who can see / edit estimates can see / edit these (they are money records).
--   variations + variation_lines   : changes to the contract, priced by quantity x rate; approved ones feed the next application
--   applications + application_lines: a payment application. Each line is a copy ("snapshot") of one line of the accepted quote or
--                                      one approved variation, with the value earned to date, so later quote edits never change it
--   invoices                        : simple deposit / stage / balance invoices for domestic jobs

create table if not exists variations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id),
  number int not null default 1,
  title text not null default '',
  description text,
  status text not null default 'draft' check (status in ('draft', 'issued', 'approved', 'rejected')),
  var_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists variations_job on variations (job_id);

create table if not exists variation_lines (
  id uuid primary key default gen_random_uuid(),
  variation_id uuid not null references variations (id),
  sort int not null default 0,
  description text not null default '',
  qty numeric(12, 3) not null default 1,
  unit text not null default 'nr',
  rate_pence numeric(14, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists variation_lines_variation on variation_lines (variation_id);

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id),
  number int not null default 1,
  status text not null default 'draft' check (status in ('draft', 'issued', 'paid')),
  app_date date not null default current_date,
  period_to date,
  retention_pct numeric(5, 2) not null default 0,
  retention_release_pence bigint not null default 0,
  cis_on boolean not null default false,
  cis_rate numeric(5, 2) not null default 20,
  cis_labour_pct numeric(5, 2) not null default 50,
  reverse_charge boolean not null default false,
  vat_rate numeric(5, 2) not null default 20,
  notes text,
  paid_pence bigint,
  paid_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists applications_job on applications (job_id);

create table if not exists application_lines (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id),
  sort int not null default 0,
  line_key text not null,                 -- 'q:<estimate line id>' or 'v:<variation id>': ties a line to the same one last time
  group_name text not null default '',
  description text not null default '',
  contract_pence bigint not null default 0,
  to_date_pence bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists application_lines_application on application_lines (application_id);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id),
  number int not null default 1,
  kind text not null default 'stage' check (kind in ('deposit', 'stage', 'balance')),
  description text not null default '',
  net_pence bigint not null default 0,
  vat_rate numeric(5, 2) not null default 20,
  reverse_charge boolean not null default false,
  inv_date date not null default current_date,
  due_date date,
  status text not null default 'draft' check (status in ('draft', 'issued', 'paid')),
  paid_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists invoices_job on invoices (job_id);

do $$
declare t text;
begin
  foreach t in array array['variations', 'variation_lines', 'applications', 'application_lines', 'invoices'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_updated') then
      execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated', t);
    end if;
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', 'view ' || t, t);
    execute format('drop policy if exists %I on %I', 'add ' || t, t);
    execute format('drop policy if exists %I on %I', 'edit ' || t, t);
    execute format('create policy %I on %I for select to authenticated using (has_perm(''estimates.view''))', 'view ' || t, t);
    execute format('create policy %I on %I for insert to authenticated with check (has_perm(''estimates.edit''))', 'add ' || t, t);
    execute format('create policy %I on %I for update to authenticated using (has_perm(''estimates.edit'')) with check (has_perm(''estimates.edit''))', 'edit ' || t, t);
  end loop;
end $$;

insert into sync_tables (table_name, columns, protected) values
  ('variations', array['job_id','number','title','description','status','var_date','deleted_at'], '{}'),
  ('variation_lines', array['variation_id','sort','description','qty','unit','rate_pence','deleted_at'], '{}'),
  ('applications', array['job_id','number','status','app_date','period_to','retention_pct','retention_release_pence','cis_on','cis_rate','cis_labour_pct','reverse_charge','vat_rate','notes','paid_pence','paid_date','deleted_at'], '{}'),
  ('application_lines', array['application_id','sort','line_key','group_name','description','contract_pence','to_date_pence','deleted_at'], '{}'),
  ('invoices', array['job_id','number','kind','description','net_pence','vat_rate','reverse_charge','inv_date','due_date','status','paid_date','notes','deleted_at'], '{}')
on conflict (table_name) do update set columns = excluded.columns, protected = excluded.protected;
