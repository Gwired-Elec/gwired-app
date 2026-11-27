-- G|Wired 024: files on a job (tech sheets, drawings, anything). Run once after 023. Safe to run twice.
-- A file is a small record (job_files) that syncs like everything else, plus the file itself in a PRIVATE storage bucket
-- called job-files. Anyone who can see jobs can open the files; anyone who can edit jobs can add and remove them.

create table if not exists job_files (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id),
  name text not null,                       -- the file's name as the person knows it
  category text not null default 'other' check (category in ('tech_sheet', 'drawing', 'photo', 'other')),
  path text not null,                       -- where it is in the bucket: <job id>/<file id>-<safe name>
  size_bytes bigint,
  mime text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists job_files_job on job_files (job_id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'job_files_updated') then
    create trigger job_files_updated before update on job_files for each row execute function set_updated_at();
  end if;
end $$;
alter table job_files enable row level security;
drop policy if exists "view job_files" on job_files;
drop policy if exists "add job_files" on job_files;
drop policy if exists "edit job_files" on job_files;
create policy "view job_files" on job_files for select to authenticated using (has_perm('jobs.view'));
create policy "add job_files" on job_files for insert to authenticated with check (has_perm('jobs.edit'));
create policy "edit job_files" on job_files for update to authenticated using (has_perm('jobs.edit')) with check (has_perm('jobs.edit'));

insert into sync_tables (table_name, columns, protected) values
  ('job_files', array['job_id','name','category','path','size_bytes','mime','notes','created_by','deleted_at'], '{}')
on conflict (table_name) do update set columns = excluded.columns, protected = excluded.protected;

-- the private bucket for the files themselves
insert into storage.buckets (id, name, public) values ('job-files', 'job-files', false)
on conflict (id) do nothing;

drop policy if exists "job files read" on storage.objects;
drop policy if exists "job files add" on storage.objects;
drop policy if exists "job files change" on storage.objects;
drop policy if exists "job files remove" on storage.objects;
create policy "job files read" on storage.objects for select to authenticated
  using (bucket_id = 'job-files' and has_perm('jobs.view'));
create policy "job files add" on storage.objects for insert to authenticated
  with check (bucket_id = 'job-files' and has_perm('jobs.edit'));
create policy "job files change" on storage.objects for update to authenticated
  using (bucket_id = 'job-files' and has_perm('jobs.edit')) with check (bucket_id = 'job-files' and has_perm('jobs.edit'));
create policy "job files remove" on storage.objects for delete to authenticated
  using (bucket_id = 'job-files' and has_perm('jobs.edit'));
