# Release plan — production release

Agreed with the owner on 2026-10-03. Each phase ends at a checkpoint: work
stops, results are shown, and the next phase starts only on approval.

## Decisions

| Area | Decision |
|---|---|
| Design | Refine the current identity (navy from the logo, Cairo, white, RTL). No new direction. |
| Sample data | Deleted entirely: seed, JSON store, "reset demo data". No demo mode. |
| Start data | Empty (company settings + one warehouse) plus an Excel/CSV import tool. |
| Database | Self-hosted Supabase on the ZimaOS box (`10.240.0.1`, gateway on port 8001). |
| Accounts | Email + password. Owner invites; no public sign-up. Roles enforced server-side. |
| Reachability | App in Docker on the ZimaOS box, Cloudflare Tunnel, at **`erp.dentec.cloud`** (registered at Hostinger, DNS already on Cloudflare; apex is parked and kept free). Supabase stays private. |
| Email | Auth emails sent as `no-reply@dentec.cloud` via an SMTP provider whose SPF/DKIM records go into Cloudflare DNS. |
| Deploy access | SSH to the ZimaOS box with a dedicated key. |
| Vercel | Project deleted after the self-hosted version is live and verified (confirmed again at that time). |
| Extra features | Audit log, nightly backups, partial PO receipts, customer statement PDF, serial + warranty tracking. |

## Role matrix (enforced in every server action and page)

| | Owner | Accountant | Sales | Technician | Viewer |
|---|---|---|---|---|---|
| Dashboard, search | ✓ | ✓ | ✓ | ✓ | ✓ |
| Products, parts, categories | edit | view | view | view | view |
| Inventory and stock moves | edit | view | view | consume parts | view |
| Customers | edit | edit | edit | view | view |
| Suppliers, purchase orders | edit | edit | view | — | view |
| Invoices | edit | edit | create/issue | — | view |
| Payments, expenses, accounting | edit | edit | — | — | view |
| Service board | edit | view | view | edit | view |
| Reports | ✓ | ✓ | sales only | — | ✓ |
| Settings, users, import, audit log | ✓ | — | — | — | — |

Void/delete of issued documents: owner and accountant only. Final table to be
confirmed at the Phase 3 checkpoint.

## Phase 0 — Access (owner actions, guided)

1. Enable SSH on ZimaOS and authorise the deploy key.
2. ~~Domain~~ — decided: `erp.dentec.cloud`.
3. Create a Cloudflare Tunnel in Zero Trust and provide its token.
4. Set up an SMTP provider (Brevo or Resend), verify `dentec.cloud` with its
   DNS records in Cloudflare, and enter the SMTP details in the Supabase `.env`
   on the server. Sender: `no-reply@dentec.cloud`.

Over SSH, the Supabase keys and the Postgres password are read from the
server's own Supabase `.env`. Secrets are kept only in server-side env files,
never committed.

## Phase 1 — Design pass ✅ done 2026-10-03, awaiting owner approval

- Screenshot audit of all routes at 390px and 1280px, AR and TR.
- KPI tiles: no truncated labels, fewer chips, calmer colour, one clear figure.
- One number format everywhere (currency position, compact suffixes).
- A localised date picker to replace the browser's English `mm/dd/yyyy`.
- Tables: density, alignment, sticky headers, better row hover and focus.
- Forms: grouping, field widths, inline validation, consistent action bar.
- Service board: card layout, readable at phone width.
- Loading skeletons (`loading.tsx`), error pages (`error.tsx`), 404, empty states.
- Toast feedback after every save, issue, receive and delete.
- Keyboard focus rings and contrast checks.
- **Checkpoint:** before/after screenshots.

## Phase 2 — Supabase schema and adapter

- SQL migrations in `supabase/migrations/`, one table per collection plus child
  tables for document lines, `numeric(14,2)` money, real foreign keys.
- `stock_moves` is append-only, enforced in the database (a trigger rejects
  UPDATE/DELETE), not just by convention.
- Document numbers come from per-type sequences, so two users can never mint
  the same invoice number.
- A new adapter behind `repository.ts` uses a direct server-side Postgres
  connection, so `transaction()` is a real BEGIN/COMMIT. An invoice and its
  stock moves still land together or not at all.
- RLS is enabled on every table. The browser never talks to the database.
- Removed: `seed.ts`, the JSON `store.ts`, `data/`, the reset button and the
  Vercel read-only workarounds. Settings shows the database status instead of a
  data folder.
- **Checkpoint:** every workflow passes against an empty Supabase.

## Phase 3 — Accounts

- Login, set-password (from invite), forgot/reset password, sign-out and a
  user menu in the top bar.
- Middleware protects every route. Print pages and the PDF API stay protected:
  the PDF renderer forwards the session.
- `users` becomes profiles linked to `auth.users`, and the role lives there.
- `src/lib/permissions.ts` holds the matrix above. It is checked in every
  action, and the navigation hides what a role cannot open.
- The `ViewRole` cookie is retired; the dashboard follows the real role.
- Auth runs through server actions only, so Supabase never needs to be public.
- A one-time bootstrap script creates the owner account.
- **Checkpoint:** log in as each role and confirm what is allowed and refused.

## Phase 4 — Features

- **Audit log:** Postgres triggers record actor, time, table, record and
  before/after for every change. Shown in Settings → Activity and as a history
  section in each drawer.
- **Partial PO receipts:** received quantity per line, a "partially received"
  status, and each receipt writes its own stock moves.
- **Customer statement:** invoices, payments and a running balance over a date
  range. Printable and PDF.
- **Serial + warranty:** items can track serials. Issuing an invoice asks for
  them. A unit records its customer, invoice and warranty end. Service jobs
  link to the exact unit, and the customer page lists their machines.
- **Import:** Settings → Import for products, parts, customers, suppliers and
  opening stock, from `.xlsx`/`.csv` templates, with a preview and
  row-by-row validation before anything is written.
- **Backups:** a nightly `pg_dump` container on the server keeps 30 days. A
  restore is tested once, for real.
- **Checkpoint:** demo of each feature.

## Phase 5 — Deployment

- `Dockerfile`: Next standalone build plus Chromium for PDFs.
- `docker-compose` on the ZimaOS box, on Supabase's Docker network, with a
  `cloudflared` container. Only the app is public.
- Supabase `SITE_URL` and redirect URLs point at the public domain so invite
  and reset links work.
- `DEPLOY.md` runbook: update, restart, logs, backup, restore.
- **Checkpoint:** live at the public URL over HTTPS.

## Phase 6 — Verification and handover

- End-to-end: every workflow as every role, on phone and desktop, AR and TR.
- Security: unauthenticated access is refused everywhere, role refusals hold,
  and no secrets are in the repo.
- `npx tsc --noEmit` is silent, and `npm run build` is clean.
- `PROJECT.md`, `CONVENTIONS.md`, `CLAUDE.md` and `README.md` are updated to
  match the new reality (auth exists, ledger in Postgres, no seed).
- The Vercel project is deleted, after asking the owner to confirm.
