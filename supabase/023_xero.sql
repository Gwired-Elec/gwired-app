-- G|Wired 023: Xero link (Phase 6). Run once after 022. Safe to run twice.
-- The "xero" Edge Function holds the connection to Xero. These tables are only ever written by that function (with the server key):
--   xero_connection    : the one connected Xero organisation and its sign-in tokens (nobody can read this from the app)
--   xero_oauth_state   : short-lived codes used while connecting (so only a real "Connect" click can complete it)
--   xero_contacts      : which Xero contact each G|Wired client is
--   xero_invoice_links : which Xero invoice an application or invoice became, and what Xero says about it (the app reads this)

create table if not exists xero_connection (
  id int primary key check (id = 1),
  tenant_id text not null,
  tenant_name text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  connected_by uuid,
  connected_at timestamptz not null default now()
);
alter table xero_connection enable row level security;       -- no policies: the tokens never leave the server

create table if not exists xero_oauth_state (
  state text primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
alter table xero_oauth_state enable row level security;

create table if not exists xero_contacts (
  client_id uuid primary key references clients (id),
  xero_contact_id text not null,
  name text
);
alter table xero_contacts enable row level security;

create table if not exists xero_invoice_links (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('application', 'invoice')),
  source_id uuid not null,
  xero_invoice_id text,
  xero_number text,
  xero_status text,                  -- DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED
  total_pence bigint,
  paid_pence bigint,
  last_error text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  field_updated jsonb not null default '{}'::jsonb,
  unique (source_type, source_id)
);
create index if not exists xero_invoice_links_source on xero_invoice_links (source_id);
alter table xero_invoice_links enable row level security;
drop policy if exists "view xero_invoice_links" on xero_invoice_links;
create policy "view xero_invoice_links" on xero_invoice_links for select to authenticated using (has_perm('estimates.view'));
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'xero_invoice_links_updated') then
    create trigger xero_invoice_links_updated before update on xero_invoice_links for each row execute function set_updated_at();
  end if;
end $$;

-- the app asks this (never the tokens): is Xero connected, and to which organisation?
create or replace function xero_status() returns table (connected boolean, tenant_name text)
language sql stable security definer set search_path = public as $$
  select true, c.tenant_name from xero_connection c where has_perm('estimates.view')
  union all
  select false, null::text where has_perm('estimates.view') and not exists (select 1 from xero_connection)
$$;
revoke all on function xero_status() from public;
grant execute on function xero_status() to authenticated;

-- the app only reads these links; changes come from the function (so no columns are writable from the app)
insert into sync_tables (table_name, columns, protected) values
  ('xero_invoice_links', array[]::text[], '{}')
on conflict (table_name) do update set columns = excluded.columns, protected = excluded.protected;
