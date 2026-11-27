-- G|Wired 028: push notifications. Run once after 027. Safe to run twice.
-- One row per phone or computer that has switched notifications on. Each person can see and remove only their own devices.
-- The "push" function (service role) reads every row to send notices. Not a sync table.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;
drop policy if exists "own push select" on push_subscriptions;
drop policy if exists "own push insert" on push_subscriptions;
drop policy if exists "own push update" on push_subscriptions;
drop policy if exists "own push delete" on push_subscriptions;
create policy "own push select" on push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "own push insert" on push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "own push update" on push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own push delete" on push_subscriptions for delete to authenticated using (user_id = auth.uid());
