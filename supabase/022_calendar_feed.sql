-- G|Wired 022: a private calendar link per person, so the diary can appear in Apple Calendar (and Outlook / Google). Run once after 021.
-- Safe to run twice. The link holds a long random secret; anyone who has the link can read that diary, so it is only ever shown to
-- its owner and can be replaced at any time (the old link then stops working). The link is served by the "diary-feed" Edge Function.

create table if not exists calendar_feeds (
  user_id uuid primary key,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);
alter table calendar_feeds enable row level security;
-- no policies: nobody reads this table directly. The app uses my_calendar_token() and the Edge Function uses the server key.

create or replace function my_calendar_token(replace_it boolean default false) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  if not has_perm('diary') then raise exception 'No access to the diary'; end if;
  if replace_it then delete from calendar_feeds where user_id = auth.uid(); end if;
  insert into calendar_feeds (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select token into t from calendar_feeds where user_id = auth.uid();
  return t;
end $$;
revoke all on function my_calendar_token(boolean) from public;
grant execute on function my_calendar_token(boolean) to authenticated;
