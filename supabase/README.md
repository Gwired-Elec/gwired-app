# Database scripts

Run in order in Supabase > SQL Editor. Never re-run a script. Any change = a new numbered script.

| Script | What it does | Run? |
|---|---|---|
| 001_foundation.sql | profiles + permissions, company settings, RLS, first-user-is-owner | yes (27 Nov) |
| 002_grant_signed_in_access.sql | gives signed-in users table access (needed on this Supabase project) | yes (27 Nov) |
| 003_grant_server_access.sql | gives the server role (Edge Functions) table access | yes (27 Nov) |
| 004_sync_clients_jobs.sql | sync engine (sync_push, conflicts), clients, contacts, jobs, job statuses, lost reasons, activity log, job numbers | yes (27 Nov) |
| 005_estimating_data.sql | suppliers, materials + multi-supplier prices, labour / point rates, assemblies, prelims, estimating defaults, import column maps | run |
| 006_simplify_statuses.sql | job statuses cut to Estimating, Quoted, Won, Closed, Lost (existing jobs moved across) | not yet |
| 007_won_becomes_live.sql | status "Won" renamed "Live" | not yet |
