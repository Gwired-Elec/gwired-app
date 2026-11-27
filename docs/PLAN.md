# G|Wired app: Phase 0 plan

Status: **Phase 0 written, waiting for Richard's approval before Phase 1.**
Written after reading `C:\Users\Richard Millmand\Projects\dbp-app` (Vite + React SPA, Supabase, Firebase Hosting, ~220 source files, 110 SQL scripts, 9 Edge Functions).

---

## 1. What dbp-app actually is (and why it changes the brief's default stack)

The brief's default is Next.js, but it says to match dbp-app. dbp-app is **not Next.js**:

| Area | dbp-app today |
|---|---|
| Front end | Vite 8 + React 19 + TypeScript 7 + react-router 7, single-page app, plain CSS (no Tailwind/shadcn) |
| Backend | **Supabase only**: Postgres + RLS, Auth, Storage, and **Edge Functions (Deno)** for anything server-side |
| Hosting | **Firebase Hosting, static** (`dist`, SPA rewrite, no-cache headers for `sw.js`/`index.html`/manifest) |
| PWA | `vite-plugin-pwa` (Workbox), `autoUpdate`, standalone manifest |
| Offline | `idb-keyval`: `cached()` read-through copies, a `supabase.ts` fetch wrapper that caches every REST GET, and a small **outbox** (`outbox.ts`) for a few write types |
| Documents | `pdf-lib` + `@pdf-lib/fontkit` (PDF), `docx` (Word), `exceljs`, all **in the browser**, so they work offline |
| Email | Edge Function `send-emails` via Microsoft Graph (shared mailbox). Needs company IT |
| AI | Edge Functions `tender-scope` / `read-pricing-pdf` call Anthropic server-side (`ANTHROPIC_API_KEY` in Supabase secrets, model in a secret) |
| Outside access | Edge Function `external`: no-account access by **hashed link token** or **6-digit email code**, returns only that person's item |
| Tests | Vitest, for money maths and parsers |
| DB changes | Numbered SQL scripts run by hand in the SQL editor |

**Recommendation: same stack for G|Wired.** Vite + React + TypeScript + Supabase + Edge Functions + Firebase Hosting (static). Reasons: you already deploy it, it is fully client-rendered (good for offline-first), PDF/DOCX generation already works offline in the browser, and nothing in the brief needs server-side rendering. Anything that must be server-side (Xero, Anthropic, email, web push, webhooks, cron) becomes an Edge Function, exactly as dbp-app does it.

Deviations I propose from dbp-app (each needs your OK):
1. **Money as integer pence** (brief rule). dbp-app uses pounds with `Math.round(n*100)/100`; I will not copy that. All new money code goes in `src/lib/money/`.
2. **A real sync engine** rather than dbp-app's read-cache + small outbox (section 3).
3. **Separate Supabase and Firebase projects**, no link to dbp-app (you said standalone).
4. Styling: plain CSS like dbp-app, or Tailwind (Q8).

> The `AGENTS.md` warning about "this is not the Next.js you know" belongs to the OneDrive folder and does not apply here: neither app uses Next.js.

---

## 2. Reuse from dbp-app (copy and adapt, no live link)

| What | dbp-app file(s) | Plan |
|---|---|---|
| Supabase client + offline read cache | `src/lib/supabase.ts`, `offline.ts` | **Replace** with the sync engine (section 3). Keep `isNetworkError`, `useOnline` |
| Outbox idea (idempotent ops, locked queue, `newId`) | `outbox.ts` | **Adapt** into the generic outbox |
| Sync/outbox pill in header | `components/OutboxPill.tsx` | Adapt into the always-visible sync indicator |
| PDF fonts loader | `pdfFonts.ts` | Copy; document font TBC (Q10) |
| PDF/Word letter + quotation builders | `letterPdf.ts`, `exportQuotation.ts`, `exportQuotationPdf.ts`, `quotations.ts` | **Adapt** as the base for quote, SoW, variation and application PDFs/DOCX |
| Excel helpers | `excel.ts`, `xlsxLoad.ts`, `xlsxText.ts` | Copy for materials CSV/Excel import and exports |
| Applications maths | `applications.ts`, `applications.test.ts` | **Reference only**: rewrite in integer pence with retention/CIS/reverse charge |
| Variations (VO register, build-up, OHP) | `variations.ts`, `VariationEditor.tsx`, `VariationsRegister.tsx` | Reference for UX; rebuild on the estimate engine |
| AI drawing take-off | `Estimating.tsx`, `TenderEnquiry.tsx`, `tenderScope.ts`, `functions/tender-scope`, `read-pricing-pdf` | **Adapt** into Phase 4 (counts + draft SoW only, Zod, retries, usage log) |
| AI usage / cost panel | `usage.ts`, `components/UsagePanel.tsx` | Adapt for `ai_runs` log and monthly cap |
| External no-account access | `functions/external`, `external.ts`, `ExternalAccess.tsx`, `ExternalPages.tsx` | **Adapt for the client portal** (Q3) |
| Email sending + templates | `functions/send-emails`, `EmailSignature.tsx`, `text_templates` | Adapt; provider decision needed (Q5) |
| Image compress / mark-up | `image.ts`, `components/MarkupEditor.tsx` | Adapt for walkaround photos; add Apple Pencil pressure |
| Rich text | `RichTextEditor.tsx`, `richText.ts`, `scopeRich.ts` | Optional, for SoW clause editing |
| Tasks | `tasks.ts`, `TaskPanel.tsx`, `MyTasks.tsx` | Reference for to-dos |
| Calendar (ICS) | `calendar.ts` | Copy for the ICS feed |
| Users / access | `functions/manage-users`, `users.ts`, `access.tsx`, `role_access`, `AdminOnly.tsx` | **Adapt** into permission flags per module |
| Notifications bell | `Bell.tsx`, `notifications.tsx`, `NotificationList.tsx` | Adapt |
| Layout / sign-in | `Layout.tsx`, `SignIn.tsx` | Rebuild around tab bar / split view, black + red |
| Help page habit | `pages/Help.tsx` | Keep a Help guide updated with every feature |
| Firebase, PWA and vitest config | `firebase.json`, `vite.config.ts`, `vitest.config.ts` | Copy and rename |
| **Materials data** | dbp-app has **no electrical materials table** (its procurement/inventory is fit-out) | Nothing to seed from there; seed from your Rexel/TLC files (Q6) |

Not reused: CVR, cashflow, programme, minutes, RFIs, snagging, O&M, H&S, sampling, procurement, subcontract payment notices. They are DBP-specific.

---

## 3. Offline / sync architecture recommendation

**Recommendation: Dexie (IndexedDB) + a custom sync engine on Supabase. Not PowerSync.**

| | PowerSync | Dexie + custom (recommended) |
|---|---|---|
| iOS Safari reliability | SQLite compiled to WASM, running in a worker with IndexedDB/OPFS underneath. Works, but is the least-trodden path on iOS and hard to debug on a phone | Plain IndexedDB, the most battle-tested storage on iOS |
| Extra moving parts | A second hosted service (PowerSync Cloud or self-hosted) connected to your Postgres, plus sync rules. Another vendor and bill | None: Supabase only, like dbp-app |
| Brief's conflict rules | Row-level; field-level and "never silently overwrite money/status/signed docs" must be built on top anyway | Built in from day one |
| Effort | Less for plain sync, more once custom conflicts and a second service are counted | More up front (I write the engine), fully under our control |
| Fits dbp-app | No | Extends its `idb-keyval` + outbox approach |

Design (all in `src/lib/sync/`):
- Every synced table has `id uuid` (client-generated), `updated_at`, `updated_by`, `deleted_at` (soft delete), `version int`, and a `field_updated jsonb` map (per-field timestamps) so last-write-wins works **per field**.
- Writes go to Dexie + an **outbox** table in one transaction. Ops are idempotent (upsert by id with an `op_id`; the server records seen op ids). Pushed in order with exponential backoff.
- Pull: per table `where updated_at > cursor`, paged, scoped by RLS and the user's permission flags. A Postgres trigger sets `updated_at` server-side so cursors are trustworthy.
- **Protected fields** (money, status, accepted/signed documents): the server compares `base_version`; if it has moved on, the write goes into a `conflicts` table instead of being applied, and the "Resolve conflicts" screen shows both versions.
- iOS has no Background Sync, so sync runs on launch, `online`, `visibilitychange`, a timer while open, and "Sync now".
- Photos: blobs in OPFS/IndexedDB, compressed (2000px long edge, JPEG 0.8, GPS stripped unless enabled), uploaded to Storage through a resumable queue with per-photo status. `navigator.storage.persist()` plus a storage meter in Settings. "Free up space" keeps thumbnails.
- The estimate engine (`src/lib/money`, `src/lib/estimate`) is pure TypeScript and runs on the device against cached materials, rates and assemblies.
- Sign-out is blocked (with a warning) while unsynced changes exist.

Honest risk: the sync engine is where projects like this go wrong. I will build it first (Phase 1b) with an automated **airplane-mode test** (Playwright WebKit, `context.setOffline`) before anything is built on top.

---

## 4. Auth plan (what Supabase can and cannot do)

- Email + password, reset link, magic link, invite-only (no public signup), TOTP 2FA and the session list are **native Supabase Auth** (invites through a `manage-users`-style Edge Function, as dbp-app does).
- **Supabase Auth has no native passkey sign-in.** Two options:
  - **A (recommended):** after a password login, register a WebAuthn passkey for *this device*. Face ID/Touch ID then **unlocks the locally stored session** and the refresh token is renewed when online. This gives the everyday "Face ID, works offline" experience with no custom server.
  - **B:** true server-verified passkey login (SimpleWebAuthn in an Edge Function that mints a session). More work and more security surface; only needed to sign in on a brand-new device with Face ID alone.
- **Offline unlock:** a browser cannot truly lock data against someone who has the unlocked device, so the protection is the app lock (passkey or PIN) plus a short auto-lock, and signing out wipes local data. I will state this plainly in the security notes.
- App PIN (4-6 digits) as fallback; auto-lock setting; rate limiting and generic error messages.
- **Permissions:** `profiles.permissions jsonb` with a flag per module (`jobs.view`, `jobs.edit`, `money.view`, `estimates.view_cost`, `diary`, `todos`, `walkarounds`, ...) plus presets (Owner, Office, Operative). RLS checks the flags, not role names. Money tables are unreadable to the Operative preset at database level and the sync pull never sends them.

---

## 5. Database schema (Supabase Postgres)

Follows section 4 of the brief, adjusted. Conventions: UUID PKs, `*_pence bigint`, `created_at/updated_at/deleted_at`, RLS on every table, an audit trigger on status and money columns.

**Core:** `profiles` (+`permissions`), `company_settings`, `clients`, `contacts`, `jobs` (+`job_type`, `payment_terms`, `retention_pct`, `retention_release_pc_pct`, `cis_mode`, `vat_mode` standard / domestic_reverse_charge, `valuation_day`, Xero ids), `job_status_history`, `job_statuses` (editable list), `lost_reasons`, `activity_log`.

**Estimating:** `suppliers`, `materials`, `material_supplier_prices` (price, price_date, preferred flag, source file), `import_mappings` (saved column maps per supplier), `labour_rates`, `point_rates`, `day_rates`, `assemblies` + `assembly_items`, `prelim_items`, `estimates` (revision, `oh_pct`, `profit_pct`, `contingency_pct`), `estimate_sections`, `estimate_lines` (**pricing_method**: units / point / day-rate; qty, cost and sell in pence, labour hours), `estimate_options` (portal option groups: extras, good/better/best).

**Site:** `walkarounds`, `walkaround_areas`, `walkaround_elements`, `photos` (storage path, annotation json, order), `sow_templates`, `sow_clauses` (library), `sow_documents` (versioned), `drawing_files`.

**Commercial / money:** `variations`, `variation_lines`, `applications`, `application_lines`, `application_payments`, `retention_ledger`, `invoices` (simple jobs), `xero_connection`, `xero_sync_log`, `xero_invoice_links` (status, paid, pay link), `costs` (manual only for now), `timesheets` (model only, UI parked).

**Productivity:** `todos` (+recurrence, show_in_diary, auto_source), `calendar_events`, `calendar_provider_links`, `push_subscriptions`, `morning_summary_log`.

**Comms / portal:** `portal_access` (token hashes, email codes), `portal_messages`, `portal_acceptances` (typed name, timestamp, IP, quote version), `email_log`, `email_templates`.

**AI:** `ai_runs` (job, kind, prompt version, model, tokens, cost, raw output, files), `ai_settings` (monthly cap).

**Sync support:** `conflicts`, `sync_ops_seen`, `updated_at` triggers.

SQL goes in `supabase/` as numbered scripts, written phase by phase.

---

## 6. Phases (as per the brief) with my notes

| Phase | Scope | Notes / risk |
|---|---|---|
| **1 Foundations** | Repo, auth (password, reset, invite, passkey unlock, PIN, 2FA), permissions, PWA shell, **Dexie + sync engine + conflicts**, tab bar / split view, settings, clients/contacts, jobs + statuses / lost reasons / chase dates, activity log, seed data | Biggest phase. Suggest splitting into **1a (auth + shell + deploy)** and **1b (sync engine + jobs)** with a review between |
| 2 Estimating core | Materials (multi-supplier, CSV import with mapping), labour / point / day rates, assemblies, estimate builder with 3 pricing methods, revisions, quote PDF, email | Money module + tests first |
| 3 Walkaround + SoW | Note-first capture, photos, mark-up + Pencil, template builder, SoW PDF/DOCX, push to estimate | I design the SoW template |
| 4 AI | Drawings to counts + draft SoW, written scope to SoW, review UI, Zod, usage log + cap | No pricing, as agreed |
| 5 Variations + applications | Retention, CIS, reverse charge, payments, simple invoices | Integer pence, heavy unit tests |
| 6 Xero | OAuth, contacts, invoices, tax types, status sync / webhooks | Needs a Xero developer app |
| 7 Client portal | Magic link, options, acceptance, variations, messages, documents, auto emails | See Q3 |
| 8 To-dos + diary | Auto to-dos, recurrence, 07:00 push + email, ICS, Google two-way | Push on iOS needs the installed PWA |
| 9 Dashboard | Money in/out, ageing, RAG | |
| 10 Polish | Playwright iOS profiles, accessibility, backups, deployment guide, user guide | |

**Parked (per brief):** Xero supplier-bill import, timesheets UI, receipt capture, Outlook/Microsoft 365 calendar, certificate forms (Trade Cert is used), a separate payment gateway.

---

## 7. Hosting and deployment

- Firebase Hosting (static, same `firebase.json` as dbp-app) + Supabase (London region). A **new Firebase project** and **new Supabase project**, owned by G|Wired.
- The Firebase CLI is currently logged out (dbp-app hosting move is paused); deploying needs `firebase login`.
- Supabase free plan has no automatic backups: use Pro (daily backups) before go-live, or add an "export everything" button.
- Secrets live only in Edge Function secrets: `ANTHROPIC_API_KEY`, Xero client id/secret, email provider key, VAPID private key, Google OAuth secret.

---

## 8. Questions for Richard (please answer before Phase 1)

1. **Stack:** OK to use Vite + React + Supabase + Firebase static hosting (as dbp-app) instead of Next.js? *(Strongly recommended.)*
2. **Sync:** OK with Dexie + custom sync engine instead of PowerSync (section 3)?
3. **Client portal:** the brief says Supabase magic-link accounts for clients. dbp-app's proven pattern gives clients **no database account**: an Edge Function checks a link or email code and returns only their own job. Safer, and clients never touch RLS. Use that pattern? *(Recommended.)*
4. **Passkeys:** Option A (Face ID unlocks the saved session on the device) or Option B (full server passkey login)?
5. **Email provider:** dbp-app sends through Microsoft 365 from a shared mailbox, which needs IT. For G|Wired is it Microsoft 365, Google Workspace, or neither? If neither, Resend is simplest.
6. **Materials data:** please supply a sample Rexel and TLC Direct price/export file (and any current point-rates list) so the CSV mapper is built against real columns.
7. **Accounts:** names and owner for the new Supabase and Firebase projects (a company account, not personal). Is the Xero organisation ready, and can you create a Xero developer app?
8. **Styling:** plain CSS like dbp-app, or Tailwind?
9. **Logo:** save it to `public/brand/gwired-logo.png` (plus an SVG if you have one).
10. **Document font:** a G|Wired font, or the open Carlito fallback?
11. **Tax defaults to confirm:** retention 0% domestic / 5% commercial; release half at PC and half at end of defects; reverse charge only on commercial CIS construction work. All editable, none hard-coded as advice.
12. **Google Calendar:** OK to create a Google Cloud OAuth app (testing mode is fine for one user at first)?
13. **Folder:** use `C:\Users\Richard Millmand\Projects\Gwired-App` (outside OneDrive) with its own git repo?

---

## 8b. Decisions so far (Richard, 27 Nov 2026)

- Stack: Vite + React + TypeScript, **Supabase + Firebase Hosting** (Richard's call; stack otherwise left to my recommendation).
- Offline: Dexie + custom sync engine (to be confirmed after the explanation).
- Client portal: dbp-app's no-account Edge Function pattern, **link only, no email code** by default (less sensitive data). Optional per-job email-code switch. Tokens long, hashed, expiring, revocable.
- Email: **Outlook / Microsoft 365 via Graph** from a shared mailbox (needs a G|Wired M365 admin: app registration, Mail.Send limited by access policy). Checklist to go in `docs/questions-for-IT.md`.
- Materials / logo: Richard adds them manually. Importer built against whatever files he supplies; placeholders until then.
- Still open: Q4 passkey option, Q7 accounts/Xero app, Q8 styling, Q10 font, Q11 tax defaults, Q12 Google OAuth app.

## 9. Progress

- [x] Phase 0: dbp-app read, this plan written
- [x] Phase 0 approved by Richard (27 Nov 2026, with defaults for open questions)
- [~] Phase 1a: done = project scaffold, PWA shell (manifest, service worker), phone tab bar / iPad sidebar, branded login (password, magic link, forgot/reset, keep-signed-in, generic errors), permission flags, `001_foundation.sql`, Firebase hosting config. Also done: Users screen + manage-users function, PIN + device Face ID app lock with auto-lock and PIN lockout, Supabase passkey sign-in, sign out of all devices, offline-safe profile. **Still to do in 1a:** TOTP 2FA for owner, iOS icons/splash (needs logo), Firebase project + first deploy, passkey RP settings for the live domain
- [~] Phase 1b: BUILT, not yet run against Supabase: script 004, Dexie + sync engine (outbox, pull, per-field LWW, protected-field conflicts, sync log), clients + contacts, jobs (list, board, detail, status flow with lost reason + chase date, activity log), money module + tests. TODO before this phase is signed off: run 004, airplane-mode Playwright test, iPhone test, settings screen for status list
- [ ] Phases 2-10
