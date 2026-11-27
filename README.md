# G|Wired app

Job, estimating and payments app for G|Wired Electrical Services. Vite + React + TypeScript, Supabase (database, auth, storage), Firebase Hosting. See `docs/PLAN.md`.

## Run it
1. `npm install`
2. Copy `.env.example` to `.env.local` and paste in the Supabase Project URL and publishable key.
3. `npm run dev`, then open the address it prints.
4. `npm run build` checks types and builds; `npm test` runs the unit tests.

## Database
Scripts are in `supabase/`, run by hand in Supabase > SQL Editor, in order. See `supabase/README.md`.

## Deploy
`npm run build`, then `firebase deploy --only hosting` (after `firebase login` and `firebase use <project>`).
