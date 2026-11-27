-- G|Wired 021: to-dos and diary (Phase 8, part 1). Run once after 020. Safe to run twice.
--   todos           : a task, optionally on a job, optionally for one person, optionally repeating
--   calendar_events : a diary entry (site visit, survey, delivery ...), optionally on a job and for one person
--   team_members()  : the names of the people who can be given a task or an event (everyone with the to-dos or diary permission can call it)
-- Anyone with the "todos" permission shares the to-do list; anyone with "diary" shares the diary.

create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  job_id uuid references jobs (id),
  assigned_to uuid,                               -- a profile id; empty = anyone / not assigned
  due_date date,
  recurrence text not null default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  show_in_diary boolean not null default true,
  done_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists todos_job on todos (job_id);

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  location text,
  job_id uuid references jobs (id),
  assigned_to uuid,
  event_date date not null,
  end_date date,                                  -- for an event over several days
  all_day boolean not null default true,
  start_time text,                                -- 'HH:MM'
  end_time text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists calendar_events_date on calendar_events (event_date);
create index if not exists calendar_events_job on calendar_events (job_id);

do $$
declare t text; p text;
begin
  foreach t in array array['todos', 'calendar_events'] loop
    p := case when t = 'todos' then 'todos' else 'diary' end;
    if not exists (select 1 from pg_trigger where tgname = t || '_updated') then
      execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated', t);
    end if;
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', 'view ' || t, t);
    execute format('drop policy if exists %I on %I', 'add ' || t, t);
    execute format('drop policy if exists %I on %I', 'edit ' || t, t);
    execute format('create policy %I on %I for select to authenticated using (has_perm(%L))', 'view ' || t, t, p);
    execute format('create policy %I on %I for insert to authenticated with check (has_perm(%L))', 'add ' || t, t, p);
    execute format('create policy %I on %I for update to authenticated using (has_perm(%L)) with check (has_perm(%L))', 'edit ' || t, t, p, p);
  end loop;
end $$;

create or replace function team_members() returns table (id uuid, full_name text, email text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.email from profiles p
  where p.active and (has_perm('todos') or has_perm('diary'))
  order by coalesce(p.full_name, p.email)
$$;
revoke all on function team_members() from public;
grant execute on function team_members() to authenticated;

insert into sync_tables (table_name, columns, protected) values
  ('todos', array['title','notes','job_id','assigned_to','due_date','recurrence','show_in_diary','done_at','created_by','deleted_at'], '{}'),
  ('calendar_events', array['title','notes','location','job_id','assigned_to','event_date','end_date','all_day','start_time','end_time','created_by','deleted_at'], '{}')
on conflict (table_name) do update set columns = excluded.columns, protected = excluded.protected;
