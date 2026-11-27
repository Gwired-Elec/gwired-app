-- G|Wired 002: let signed-in users reach the tables.
-- This Supabase project doesn't hand out table access automatically, so after 001 signed-in users get "permission denied"
-- and the app shows "No access". This gives the "authenticated" role (anyone signed in) access to everything in public, and
-- to anything added by later scripts. Signed-out visitors ("anon") still get nothing. Row level security from 001 stays on and
-- is what actually decides who sees which rows. No tables or data are changed.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;
