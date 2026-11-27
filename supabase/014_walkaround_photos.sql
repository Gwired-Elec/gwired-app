-- G|Wired 014: walkaround photos (Phase 3, part 2). Run once after 013. Safe to run twice.
-- A photo is a small record (walkaround_photos) that syncs like everything else, plus the picture itself in a PRIVATE storage
-- bucket called walkaround-photos. The phone saves the picture on the device first and uploads it when there is signal.
-- Same permission as the rest of the walkaround: "walkarounds".

create table if not exists walkaround_photos (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references walkaround_areas (id),
  path text not null,                       -- where the picture is in the bucket: <job id>/<photo id>.jpg
  caption text,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb
);
create index if not exists walkaround_photos_area on walkaround_photos (area_id);

do $$
declare t text := 'walkaround_photos';
begin
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
end $$;

insert into sync_tables (table_name, columns, protected) values
  ('walkaround_photos', array['area_id','path','caption','sort','deleted_at'], '{}')
on conflict (table_name) do update set columns = excluded.columns, protected = excluded.protected;

-- the private bucket for the pictures
insert into storage.buckets (id, name, public) values ('walkaround-photos', 'walkaround-photos', false)
on conflict (id) do nothing;

drop policy if exists "walkaround photos read" on storage.objects;
drop policy if exists "walkaround photos add" on storage.objects;
drop policy if exists "walkaround photos change" on storage.objects;
create policy "walkaround photos read" on storage.objects for select to authenticated
  using (bucket_id = 'walkaround-photos' and has_perm('walkarounds'));
create policy "walkaround photos add" on storage.objects for insert to authenticated
  with check (bucket_id = 'walkaround-photos' and has_perm('walkarounds'));
create policy "walkaround photos change" on storage.objects for update to authenticated
  using (bucket_id = 'walkaround-photos' and has_perm('walkarounds')) with check (bucket_id = 'walkaround-photos' and has_perm('walkarounds'));
