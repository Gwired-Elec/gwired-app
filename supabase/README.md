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
| 009_overheads_profit.sql | one combined overheads and profit %, or split materials and labour | not yet |
| 010_line_sell_override.sql | a line's sell each can be set by hand | not yet |
| 011_labour_day_night.sql | labour rates: cost and charged out per 8-hour day, night shift price, no overtime | not yet |
| 012_clauses.sql | standard exclusions and assumptions library, ticked onto each estimate | not yet |
| 013_walkaround.sql | site walkaround: areas, notes and items per job | not yet |
| 014_walkaround_photos.sql | walkaround photos: record table and the private photo storage | not yet |
| 015_photo_items.sql | photos belong to an item rather than an area | not yet |
| 016_photo_original.sql | keep the original photo when it is marked up | not yet |
| 017_commercial.sql | variations, applications for payment, invoices (Phase 5) | run |
| 018_variation_accepted.sql | part-accepted variations (value the client accepted) | run |
| 019_variation_estimates.sql | price variations like an estimate (materials, points, day rates) | run |
| 020_variation_photos.sql | photos on variation items | not yet |
| 021_todos_diary.sql | to-dos, diary events, team list (Phase 8) | not yet |
| 008_estimates.sql | estimates, sections and lines for the estimate builder | not yet |
