-- G|Wired 003: let the server role (used by Edge Functions) reach the tables.
-- Like 002 for signed-in users: this Supabase project doesn't hand out table access automatically, so the manage-users
-- function got "permission denied for table profiles". The service role is only ever used inside Edge Functions
-- (never in the app) and is what the invite, Xero, email and AI functions will use later.

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
