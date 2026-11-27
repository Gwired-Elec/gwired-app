-- G|Wired 013: site walkaround (Phase 3, part 1). Run once after 012. Safe to run twice.
-- A job has walkaround AREAS (kitchen, plant room, first floor ...). Each area has free notes, and a list of ELEMENTS: the
-- things to be done there, each with a quantity and unit. Later these become the scope of works and feed the estimate.
-- Anyone with the "walkarounds" permission can read and change them (that includes operatives); no prices are held here.

create table if not exists walkarounds (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id),
  title text,
  visit_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists walkarounds_job on walkarounds (job_id);

create table if not exists walkaround_areas (
  id uuid primary key default gen_random_uuid(),
  walkaround_id uuid not null references walkarounds (id),
  name text not null,
  notes text,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists walkaround_areas_walkaround on walkaround_areas (walkaround_id);

create table if not exists walkaround_elements (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references walkaround_areas (id),
  description text not null,
  qty numeric(12, 3) not null default 1,
  unit text not null default 'nr',
  notes text,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists walkaround_elements_area on walkaround_elements (area_id);

do $$
declare t text;
begin
  foreach t in array array['walkarounds', 'walkaround_areas', 'walkaround_elements'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_updated') then
      execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated', t);
    end if;
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', 'view ' || t, t);
    execute format('drop policy if exists %I on %I', 'add ' || t, t);
    execute format('drop policy if exists %I on %I', 'edit ' || t, t);
    execute format('create policy %I on %I for select to authenticated using (has_perm(''walkarounds''))', 'view ' || t, t);
    execute format('create policy %I on %I for insert to authenticated with check (has_perm(''walkarounds''))', 'add ' || t, t);
    execute format('create policy %I on %I for update to authenticated using (has_perm(''walkarounds'')) with check (has_perm(''walkarounds''))', 'edit ' || t, t);
  end loop;
end $$;

insert into sync_tables (table_name, columns, protected) values
  ('walkarounds', array['job_id','title','visit_date','notes','deleted_at'], '{}'),
  ('walkaround_areas', array['walkaround_id','name','notes','sort','deleted_at'], '{}'),
  ('walkaround_elements', array['area_id','description','qty','unit','notes','sort','deleted_at'], '{}')
on conflict (table_name) do update set columns = excluded.columns, protected = excluded.protected;
