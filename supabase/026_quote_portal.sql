-- G|Wired 026: client quote portal. Run once after 025. Safe to run twice.
-- A "client link" is a private web address for one issued quote: the client opens it with no sign-in and can read the quote,
-- download the PDF and accept it. The address contains a long random secret (the token), so only people sent the link can open it.
--   quote_links : one row per link. Holds a frozen copy (snapshot) of the quote exactly as issued, who has opened it and who accepted.
-- The public page talks to the quote-portal Edge Function (Verify JWT OFF), never to this table directly. Staff with the
-- estimates permissions can see and manage links. Not part of offline sync: links are made while online.

create table if not exists quote_links (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references estimates (id),
  job_id uuid not null references jobs (id),
  token text not null unique,
  snapshot jsonb not null,                 -- the quote as the client sees it (prices only, never costs)
  pdf_path text,                           -- the PDF in the private quote-pdfs bucket
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count int not null default 0,
  accepted_at timestamptz,
  accepted_name text,
  accepted_ip text,
  accepted_agent text
);
create index if not exists quote_links_estimate on quote_links (estimate_id);
create index if not exists quote_links_job on quote_links (job_id);

alter table quote_links enable row level security;
drop policy if exists "view quote_links" on quote_links;
drop policy if exists "add quote_links" on quote_links;
drop policy if exists "edit quote_links" on quote_links;
create policy "view quote_links" on quote_links for select to authenticated using (has_perm('estimates.view'));
create policy "add quote_links" on quote_links for insert to authenticated with check (has_perm('estimates.edit'));
create policy "edit quote_links" on quote_links for update to authenticated using (has_perm('estimates.edit')) with check (has_perm('estimates.edit'));

-- the PDFs: private bucket. The portal function hands the client a short-lived download address.
insert into storage.buckets (id, name, public) values ('quote-pdfs', 'quote-pdfs', false)
on conflict (id) do nothing;

drop policy if exists "quote pdfs read" on storage.objects;
drop policy if exists "quote pdfs add" on storage.objects;
drop policy if exists "quote pdfs change" on storage.objects;
create policy "quote pdfs read" on storage.objects for select to authenticated
  using (bucket_id = 'quote-pdfs' and has_perm('estimates.view'));
create policy "quote pdfs add" on storage.objects for insert to authenticated
  with check (bucket_id = 'quote-pdfs' and has_perm('estimates.edit'));
create policy "quote pdfs change" on storage.objects for update to authenticated
  using (bucket_id = 'quote-pdfs' and has_perm('estimates.edit')) with check (bucket_id = 'quote-pdfs' and has_perm('estimates.edit'));
