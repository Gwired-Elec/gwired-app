-- G|Wired 004: sync engine (server side), clients, contacts, jobs, job statuses, activity log.
-- Run once in Supabase > SQL Editor after 001-003. Never re-run.
--
-- How sync works (see docs/PLAN.md section 3):
--  * every device writes to its own local database first, and queues each change as an "op"
--  * sync_push() applies a batch of ops: new rows are inserted; for existing rows each changed field is applied
--    - ordinary fields: last write wins PER FIELD (compared by the time the change was made on the device)
--    - protected fields (status, lost reason, money): applied only if the server still holds the value the device
--      started from; otherwise nothing is overwritten and a row goes into "conflicts" for a person to resolve
--    - every op has an id, so a retry after a dropped connection is harmless
--  * devices pull changes with "updated_at > last seen"
-- sync_push runs as the signed-in user, so row level security decides what each person may change.

-- updated_at must be strictly increasing so pull cursors never miss a row (now() repeats inside one transaction)
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end $$;

-- which tables sync, which columns a device may write, and which are protected
create table if not exists sync_tables (
  table_name text primary key,
  columns text[] not null,
  protected text[] not null default '{}'
);
alter table sync_tables enable row level security;
create policy "staff read sync_tables" on sync_tables for select to authenticated using (true);

create table if not exists sync_ops_seen (
  op_id uuid primary key,
  user_id uuid not null default auth.uid(),
  seen_at timestamptz not null default now()
);
alter table sync_ops_seen enable row level security;
create policy "own ops seen" on sync_ops_seen for select to authenticated using (user_id = auth.uid());
create policy "own ops insert" on sync_ops_seen for insert to authenticated with check (user_id = auth.uid());

create table if not exists conflicts (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid not null,
  field text not null,
  server_value jsonb,
  client_value jsonb,
  base_value jsonb,
  op_id uuid,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text
);
alter table conflicts enable row level security;
create policy "own conflicts read" on conflicts for select to authenticated using (user_id = auth.uid() or has_perm('users'));
create policy "own conflicts insert" on conflicts for insert to authenticated with check (user_id = auth.uid());
create policy "own conflicts update" on conflicts for update to authenticated using (user_id = auth.uid() or has_perm('users'));

-- ---------------------------------------------------------------- tables
create table if not exists job_statuses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort int not null default 0,
  colour text not null default '#52525b',
  is_lost boolean not null default false,       -- asks for a lost reason
  asks_chase boolean not null default false,    -- asks for a chase date
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create table if not exists lost_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 0,
  needs_note boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_type text not null default 'domestic' check (client_type in ('domestic', 'commercial')),
  email text,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id),
  name text not null,
  role text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text unique,                         -- GW-2026-001, assigned by the server when the job first syncs
  title text not null,
  client_id uuid references clients (id),
  contact_id uuid references contacts (id),
  site_address text,
  main_contractor text,
  job_type text not null default 'domestic' check (job_type in ('domestic', 'commercial', 'industrial', 'eicr', 'testing', 'maintenance')),
  source text,
  status text not null default 'enquiry',
  lost_reason text,
  lost_note text,
  chase_date date,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
-- money lives in its own table so people without price access never receive it (the row level security hides it)
create table if not exists job_financials (
  id uuid primary key references jobs (id),       -- same id as the job
  quote_value_pence bigint,
  quote_date date,
  valid_until date,
  probability int check (probability between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  entity_id uuid not null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  user_id uuid default auth.uid(),
  user_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists activity_entity on activity_log (entity_id, created_at);
create index if not exists jobs_status on jobs (status);

do $$
declare t text;
begin
  foreach t in array array['job_statuses', 'lost_reasons', 'clients', 'contacts', 'jobs', 'job_financials', 'activity_log'] loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated', t);
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- job numbers: GW-<year>-<running number>, assigned on the server so two offline devices never clash
create table if not exists job_counters (year int primary key, n int not null default 0);
alter table job_counters enable row level security;  -- no policies: only the function below touches it
create or replace function next_job_number() returns trigger language plpgsql security definer set search_path = public as $$
declare y int := extract(year from now());
        k int;
begin
  if new.job_number is null then
    insert into job_counters (year, n) values (y, 1) on conflict (year) do update set n = job_counters.n + 1 returning n into k;
    new.job_number := 'GW-' || y || '-' || lpad(k::text, 3, '0');
  end if;
  return new;
end $$;
create trigger jobs_number before insert on jobs for each row execute function next_job_number();

-- ---------------------------------------------------------------- row level security
create policy "view statuses" on job_statuses for select to authenticated using (has_perm('jobs.view'));
create policy "edit statuses" on job_statuses for all to authenticated using (has_perm('settings')) with check (has_perm('settings'));
create policy "view lost reasons" on lost_reasons for select to authenticated using (has_perm('jobs.view'));
create policy "edit lost reasons" on lost_reasons for all to authenticated using (has_perm('settings')) with check (has_perm('settings'));

create policy "view clients" on clients for select to authenticated using (has_perm('clients.view') or has_perm('jobs.view'));
create policy "add clients" on clients for insert to authenticated with check (has_perm('clients.edit'));
create policy "edit clients" on clients for update to authenticated using (has_perm('clients.edit')) with check (has_perm('clients.edit'));
create policy "view contacts" on contacts for select to authenticated using (has_perm('clients.view') or has_perm('jobs.view'));
create policy "add contacts" on contacts for insert to authenticated with check (has_perm('clients.edit'));
create policy "edit contacts" on contacts for update to authenticated using (has_perm('clients.edit')) with check (has_perm('clients.edit'));

create policy "view jobs" on jobs for select to authenticated using (has_perm('jobs.view'));
create policy "add jobs" on jobs for insert to authenticated with check (has_perm('jobs.edit'));
create policy "edit jobs" on jobs for update to authenticated using (has_perm('jobs.edit')) with check (has_perm('jobs.edit'));

create policy "view job money" on job_financials for select to authenticated using (has_perm('estimates.view'));
create policy "add job money" on job_financials for insert to authenticated with check (has_perm('estimates.edit'));
create policy "edit job money" on job_financials for update to authenticated using (has_perm('estimates.edit')) with check (has_perm('estimates.edit'));

create policy "view activity" on activity_log for select to authenticated using (has_perm('jobs.view'));
create policy "add activity" on activity_log for insert to authenticated with check (has_perm('jobs.view') and user_id = auth.uid());
-- no update/delete policy: the activity log is append-only

-- ---------------------------------------------------------------- which columns sync
insert into sync_tables (table_name, columns, protected) values
  ('job_statuses', array['slug','name','sort','colour','is_lost','asks_chase','active','deleted_at'], '{}'),
  ('lost_reasons', array['name','sort','needs_note','deleted_at'], '{}'),
  ('clients', array['name','client_type','email','phone','address','notes','deleted_at'], '{}'),
  ('contacts', array['client_id','name','role','email','phone','deleted_at'], '{}'),
  ('jobs', array['title','client_id','contact_id','site_address','main_contractor','job_type','source','status','lost_reason','lost_note','chase_date','notes','created_at','deleted_at'], array['status','lost_reason']),
  ('job_financials', array['quote_value_pence','quote_date','valid_until','probability','deleted_at'], array['quote_value_pence']),
  ('activity_log', array['entity','entity_id','action','detail','user_id','user_name','created_at'], '{}')
on conflict (table_name) do update set columns = excluded.columns, protected = excluded.protected;

-- ---------------------------------------------------------------- the sync function
create or replace function sync_push(p_ops jsonb) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  op jsonb; cfg sync_tables%rowtype;
  v_op uuid; v_tbl text; v_row uuid; v_patch jsonb; v_base jsonb; v_ts timestamptz; v_force boolean;
  existing jsonb; k text; v jsonb; cur jsonb; cur_ts text;
  filtered jsonb; applied jsonb; conflicts_n int; n int;
  collist text; sets text;
  results jsonb := '[]'::jsonb;
begin
  for op in select * from jsonb_array_elements(p_ops) loop
    v_op := (op ->> 'op_id')::uuid;
    begin
      if exists (select 1 from sync_ops_seen s where s.op_id = v_op) then
        results := results || jsonb_build_object('op_id', v_op, 'status', 'duplicate');
        continue;
      end if;

      v_tbl := op ->> 'table';
      v_row := (op ->> 'row_id')::uuid;
      v_patch := coalesce(op -> 'patch', '{}'::jsonb);
      v_base := coalesce(op -> 'base', '{}'::jsonb);
      v_force := coalesce((op ->> 'force')::boolean, false);
      -- the time the change was made on the device, never allowed to be far in the future
      v_ts := least(coalesce((op ->> 'ts')::timestamptz, now()), now() + interval '2 minutes');
      conflicts_n := 0;

      select * into cfg from sync_tables where table_name = v_tbl;
      if not found then
        results := results || jsonb_build_object('op_id', v_op, 'status', 'error', 'message', 'Unknown table ' || coalesce(v_tbl, ''));
        continue;
      end if;

      -- only columns this table allows
      filtered := '{}'::jsonb;
      for k, v in select * from jsonb_each(v_patch) loop
        if k = any (cfg.columns) then filtered := filtered || jsonb_build_object(k, v); end if;
      end loop;

      execute format('select to_jsonb(t) from %I t where t.id = $1', v_tbl) into existing using v_row;

      if existing is null then
        -- a new row: insert only the columns we were sent (the rest take their defaults)
        select string_agg(quote_ident(key), ',') into collist from jsonb_object_keys(filtered || jsonb_build_object('id', v_row, 'field_updated', '{}'::jsonb)) as key;
        filtered := filtered || jsonb_build_object('id', v_row, 'field_updated', (select coalesce(jsonb_object_agg(key, v_ts), '{}'::jsonb) from jsonb_object_keys(filtered) as key));
        execute format('insert into %I (%s) select %s from jsonb_populate_record(null::%I, $1)', v_tbl, collist, collist, v_tbl) using filtered;
      else
        applied := '{}'::jsonb;
        for k, v in select * from jsonb_each(filtered) loop
          cur := existing -> k;
          if cur is not distinct from v then
            continue;                                              -- already that value
          elsif k = any (cfg.protected) and not v_force then
            if v_base ? k and cur is not distinct from (v_base -> k) then
              applied := applied || jsonb_build_object(k, v);      -- server still holds what the device started from
            else
              insert into conflicts (table_name, row_id, field, server_value, client_value, base_value, op_id)
              values (v_tbl, v_row, k, cur, v, v_base -> k, v_op);
              conflicts_n := conflicts_n + 1;
            end if;
          else
            cur_ts := existing -> 'field_updated' ->> k;           -- last write wins, per field
            if v_force or cur_ts is null or v_ts >= cur_ts::timestamptz then
              applied := applied || jsonb_build_object(k, v);
            end if;
          end if;
        end loop;

        if applied <> '{}'::jsonb then
          select string_agg(format('%I = r.%I', key, key), ', ') into sets from jsonb_object_keys(applied) as key;
          execute format(
            'update %I t set %s, field_updated = coalesce(t.field_updated, ''{}''::jsonb) || (select jsonb_object_agg(key, $3::text) from jsonb_object_keys($2) as key) from jsonb_populate_record(null::%I, $2) r where t.id = $1',
            v_tbl, sets, v_tbl) using v_row, applied, v_ts;
          get diagnostics n = row_count;
          if n = 0 then
            results := results || jsonb_build_object('op_id', v_op, 'status', 'error', 'message', 'Not allowed to change this record.');
            continue;
          end if;
        end if;
      end if;

      insert into sync_ops_seen (op_id) values (v_op);
      results := results || jsonb_build_object('op_id', v_op, 'status', case when conflicts_n > 0 then 'conflict' else 'applied' end, 'conflicts', conflicts_n);
    exception when others then
      results := results || jsonb_build_object('op_id', v_op, 'status', 'error', 'message', sqlerrm);
    end;
  end loop;
  return results;
end $$;

-- a person resolves a conflict: keep what the server has, or force their own value in
create or replace function resolve_conflict(p_id uuid, p_use_mine boolean) returns void language plpgsql security invoker set search_path = public as $$
declare c conflicts%rowtype;
begin
  select * into c from conflicts where id = p_id and resolved_at is null;
  if not found then raise exception 'That conflict has already been resolved or is not yours.'; end if;
  if p_use_mine then
    perform sync_push(jsonb_build_array(jsonb_build_object(
      'op_id', gen_random_uuid(), 'table', c.table_name, 'row_id', c.row_id,
      'patch', jsonb_build_object(c.field, c.client_value), 'force', true, 'ts', now())));
  end if;
  update conflicts set resolved_at = now(), resolution = case when p_use_mine then 'mine' else 'server' end where id = p_id;
end $$;

-- ---------------------------------------------------------------- defaults
insert into job_statuses (slug, name, sort, colour, is_lost, asks_chase) values
  ('enquiry', 'Enquiry', 10, '#71717a', false, false),
  ('site_visit_booked', 'Site Visit Booked', 20, '#0369a1', false, false),
  ('estimating', 'Estimating', 30, '#7c3aed', false, false),
  ('priced_quote_sent', 'Priced / Quote Sent', 40, '#b45309', false, false),
  ('awaiting_feedback', 'Awaiting Feedback', 50, '#d97706', false, true),
  ('won', 'Won', 60, '#15803d', false, false),
  ('in_progress', 'In Progress', 70, '#1d4ed8', false, false),
  ('practical_completion', 'Practical Completion', 80, '#0f766e', false, false),
  ('final_account', 'Final Account', 90, '#4d7c0f', false, false),
  ('closed', 'Closed', 100, '#3f3f46', false, false),
  ('lost', 'Lost', 110, '#b91c1c', true, false),
  ('on_hold', 'On Hold', 120, '#a16207', false, false)
on conflict (slug) do nothing;

insert into lost_reasons (name, sort, needs_note)
select * from (values
  ('Price', 10, false), ('Programme', 20, false), ('Went with another contractor', 30, false),
  ('Client cancelled', 40, false), ('No response', 50, false), ('Other', 60, true)
) v(name, sort, needs_note)
where not exists (select 1 from lost_reasons);
