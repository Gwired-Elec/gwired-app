-- G|Wired 012: standard exclusions and assumptions. Run once after 011. Safe to run twice (it skips anything already there).
-- A library of standard wording (clause_library) that you tick onto each estimate. Ticking copies the wording onto the estimate
-- (estimate_clauses), so it can be edited for that one quote without changing the library, and an issued quote never changes
-- when the library does. Same idea as the clause library in the DBP app.

create table if not exists clause_library (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('exclusion', 'assumption')),
  title text not null,
  body text not null,
  sort int not null default 0,
  default_on boolean not null default false,     -- ticked automatically on every new estimate
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);

create table if not exists estimate_clauses (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references estimates (id),
  library_id uuid references clause_library (id),  -- empty for a clause written just for this quote
  kind text not null check (kind in ('exclusion', 'assumption')),
  title text not null,
  body text not null,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists estimate_clauses_estimate on estimate_clauses (estimate_id);

do $$
declare t text;
begin
  foreach t in array array['clause_library', 'estimate_clauses'] loop
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
  ('clause_library', array['kind','title','body','sort','default_on','active','deleted_at'], '{}'),
  ('estimate_clauses', array['estimate_id','library_id','kind','title','body','sort','deleted_at'], '{}')
on conflict (table_name) do update set columns = excluded.columns, protected = excluded.protected;

-- Starter wording for an electrical contractor. Edit, delete or add your own under More > Estimating data > Exclusions and assumptions.
insert into clause_library (kind, title, body, sort, default_on)
select v.kind, v.title, v.body, v.sort, v.default_on
from (values
  ('assumption', 'Access', 'Free and clear access to all working areas during normal working hours (Monday to Friday, 08:00 to 17:00).', 10, true),
  ('assumption', 'Temporary power and welfare', 'A suitable supply of temporary power, lighting and welfare facilities will be provided by others.', 20, true),
  ('assumption', 'Existing installation', 'The existing installation is in a safe condition to connect to. Any defects found will be reported and priced separately as a variation.', 30, true),
  ('assumption', 'Existing supply', 'The existing incoming supply and main earthing and bonding are adequate and suitable for the new loads. No allowance is made for upgrading them.', 40, false),
  ('assumption', 'Based on drawings', 'This price is based on the drawings and specification listed on the quote. Any later changes will be treated as a variation.', 50, true),
  ('assumption', 'Ceilings and walls', 'Ceilings and walls are assumed to be suitable for fixing and cable routes, and clear of asbestos. Any asbestos found will be reported to the client immediately and works stopped in that area.', 60, false),
  ('assumption', 'Programme', 'Works can proceed in a logical sequence without interruption. Waiting time or return visits caused by others will be charged as a variation.', 70, false),
  ('assumption', 'Standards', 'All work is carried out to the current edition of BS 7671 and certified on completion.', 80, true),
  ('exclusion', 'Out-of-hours working', 'Out-of-hours, night, weekend and bank holiday working, unless stated in the schedule.', 10, true),
  ('exclusion', 'Builder''s work', 'Builder''s work, chasing into structural elements, core drilling, fire stopping (other than to our own penetrations), decoration and making good beyond our own work.', 20, true),
  ('exclusion', 'Incoming supply', 'Works to the incoming supply, DNO or meter operator charges, and supply upgrades.', 30, true),
  ('exclusion', 'Other systems', 'Fire alarm, security, data and audio-visual systems, unless stated in the schedule.', 40, false),
  ('exclusion', 'Access equipment', 'Scaffold, tower and powered access equipment, unless stated in the schedule.', 50, false),
  ('exclusion', 'Plant and equipment', 'Supply and connection of plant and equipment by others (for example mechanical plant, kitchen equipment and lifts), unless stated in the schedule.', 60, false),
  ('exclusion', 'Asbestos', 'Investigation, removal or encapsulation of asbestos.', 70, true),
  ('exclusion', 'Works not in the schedule', 'Any works not explicitly stated in the schedule.', 80, true)
) as v(kind, title, body, sort, default_on)
where not exists (select 1 from clause_library c where c.kind = v.kind and c.title = v.title);
