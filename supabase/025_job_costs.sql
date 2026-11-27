-- G|Wired 025: job costs (money going out on a job). Run once after 024. Safe to run twice.
-- One table holds four kinds of cost line:
--   labour          : days worked x day cost. Normally worked out from the diary; a row here with source_event_id set OVERRULES that diary entry
--                     (different days or rate, or "not worked"); a row with no source_event_id is time added by hand.
--   material        : materials bought (status 'actual') or still to buy (status 'needed')
--   misc            : other costs on the job
--   non_recoverable : costs the company has to absorb (cannot be charged on to the client)
-- Anyone with the "costs" permission can see and change these.

create table if not exists job_costs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id),
  kind text not null check (kind in ('labour', 'material', 'misc', 'non_recoverable')),
  status text not null default 'actual' check (status in ('actual', 'needed')),
  description text not null default '',
  supplier text,
  person text,
  days numeric(8, 2),                       -- labour only
  rate_pence bigint,                        -- labour only: cost of a day
  amount_pence bigint not null default 0,   -- the cost (for labour: days x rate)
  cost_date date,
  source_event_id uuid references calendar_events (id),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists job_costs_job on job_costs (job_id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'job_costs_updated') then
    create trigger job_costs_updated before update on job_costs for each row execute function set_updated_at();
  end if;
end $$;
alter table job_costs enable row level security;
drop policy if exists "view job_costs" on job_costs;
drop policy if exists "add job_costs" on job_costs;
drop policy if exists "edit job_costs" on job_costs;
create policy "view job_costs" on job_costs for select to authenticated using (has_perm('costs'));
create policy "add job_costs" on job_costs for insert to authenticated with check (has_perm('costs'));
create policy "edit job_costs" on job_costs for update to authenticated using (has_perm('costs')) with check (has_perm('costs'));

insert into sync_tables (table_name, columns, protected) values
  ('job_costs', array['job_id','kind','status','description','supplier','person','days','rate_pence','amount_pence','cost_date','source_event_id','notes','created_by','deleted_at'], '{}')
on conflict (table_name) do update set columns = excluded.columns, protected = excluded.protected;
