-- G|Wired 001: foundation (users, permissions, company settings).
-- Run once in Supabase > SQL Editor on the NEW G|Wired project. Never re-run.
--
-- BEFORE signing in: Supabase > Authentication > Sign In / Providers > turn OFF "Allow new users to sign up"
-- (G|Wired is invite-only). Then create the owner: Authentication > Users > Add user (email + password, tick auto-confirm).
-- The first user created becomes the Owner automatically; anyone after that starts switched off until the Owner enables them.

create extension if not exists pgcrypto;

-- keeps updated_at honest on every table that has one (also used by the sync engine's pull cursors)
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  preset text not null default 'operative',
  permissions jsonb not null default '{}'::jsonb,   -- { "jobs.view": true, ... } see src/lib/permissions.ts
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on profiles for each row execute function set_updated_at();

-- does the signed-in user hold this permission? (security definer so RLS policies can use it without recursion)
create or replace function has_perm(p text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select active and coalesce((permissions ->> p)::boolean, false) from profiles where id = auth.uid()), false)
$$;

-- every new auth user gets a profile; the very first one is the Owner with every permission
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare
  first_user boolean;
begin
  select not exists (select 1 from profiles) into first_user;
  insert into profiles (id, email, full_name, preset, permissions, active)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    case when first_user then 'owner' else 'operative' end,
    case when first_user then jsonb_build_object(
      'jobs.view', true, 'jobs.edit', true, 'clients.view', true, 'clients.edit', true, 'diary', true, 'todos', true,
      'walkarounds', true, 'estimates.view', true, 'estimates.edit', true, 'estimates.view_cost', true, 'variations', true,
      'applications', true, 'money.view', true, 'costs', true, 'settings', true, 'users', true) else '{}'::jsonb end,
    first_user
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

alter table profiles enable row level security;
create policy "read own profile" on profiles for select to authenticated using (id = auth.uid());
create policy "users admin read" on profiles for select to authenticated using (has_perm('users'));
create policy "users admin update" on profiles for update to authenticated using (has_perm('users')) with check (has_perm('users'));
-- no insert/delete policies: profiles are created by the trigger above and removed with the auth user

create table if not exists company_settings (
  id int primary key default 1 check (id = 1),     -- exactly one row
  company_name text not null default 'G|Wired Electrical Services',
  address text,
  vat_number text,
  utr text,
  companies_house_no text,
  email text,
  phone text,
  settings jsonb not null default '{}'::jsonb,       -- defaults: retention, payment terms, OH&P, auto-lock minutes ...
  updated_at timestamptz not null default now()
);
create trigger company_settings_updated before update on company_settings for each row execute function set_updated_at();
insert into company_settings (id) values (1) on conflict do nothing;

alter table company_settings enable row level security;
create policy "staff read settings" on company_settings for select to authenticated using (has_perm('jobs.view') or has_perm('settings'));
create policy "settings write" on company_settings for update to authenticated using (has_perm('settings')) with check (has_perm('settings'));
