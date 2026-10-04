# Dentec ERP

Inventory, sales, purchasing, service and light accounting for a dental
equipment business. Arabic-first (RTL), Turkish ready.

## Running it locally

The app needs Postgres. For development there is a throwaway one that runs
inside Node — no Docker, nothing installed, gone when you stop it:

```bash
npm run db:dev        # empty database on 127.0.0.1:54329, schema applied
npm run dev           # http://localhost:3000, reads .env.local
```

`.env.local` (gitignored) points the app at it:

```
DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres
DATABASE_POOL_SIZE=1
```

`npm run test:store` runs the storage checks against that empty database.

There is no sample data. A fresh install starts with company settings and one
warehouse, and the dashboard shows a getting-started checklist until the
basics are in.

## Production

The database is the self-hosted Supabase on the ZimaOS server. Deployment
steps live in `RELEASE-PLAN.md` (Phase 5) until `DEPLOY.md` is written.
Schema changes are SQL files in `supabase/migrations/`, applied once each by:

```bash
DATABASE_ADMIN_URL=postgres://postgres:<pw>@<host>:5432/postgres npm run db:migrate
```

## How it is put together

- **Next.js 15 App Router + TypeScript + Tailwind v4.** Mutations are Server
  Actions — there is no REST layer to maintain.
- **No runtime dependencies beyond React and Next.** Charts are hand-written
  SVG, icons are a local stroke set.

### Storage

Postgres, in a private `erp` schema that Supabase's public API does not
expose, with row-level security on every table. Pages and actions still go
through `src/lib/data/repository.ts` and see one `Database` object;
`src/lib/data/store.ts` is the only file that knows about SQL.

- **Reads** cache what was loaded and ask `erp.table_versions` (bumped by a
  trigger on every write) which tables changed — one small query per read.
- **Writes** take an advisory lock, re-read inside it, let the action change a
  private copy, and write only the rows that differ, in one transaction. An
  invoice and its stock moves land together or not at all, and a failed
  action leaves nothing behind.
- `src/lib/data/schema-map.ts` maps each type in `types.ts` to its table.
  A field added to a type must be added there too, or it is not stored.

### Stock is a ledger

`stockMoves` is append-only. On-hand is always derived by summing it, never
stored. Selling, receiving a purchase order, consuming a part on a service job
and manual counts each write one move carrying a reason and a link back to the
document. Voiding an invoice does not delete its moves — it writes opposing
`return` moves, so the history stays intact.

Products and spare parts share one `items` table with an `itemType`. A spare
part is a product that happens to fit a machine; `fitsItemIds` records which.

### Money

All totals come from `src/lib/money.ts`. A document-level discount is spread
across lines in proportion to their value *before* tax, because lines can carry
different VAT rates and discounting the gross would quietly shift money between
tax bands.

Documents can be raised in a currency other than the base one. The exchange rate
is frozen onto the document, so historical figures do not move when today's rate
changes.

### Arabic and Turkish

Locale is a cookie; `<html lang dir>` follows it. Strings live in
`src/lib/i18n/ar.ts` (the reference locale) and `tr.ts`, which is partial and
falls back to Arabic — so an untranslated key shows Arabic, never a raw key.

Layout uses logical CSS properties throughout, so Turkish LTR is a `dir` flip
rather than a restyle. Numbers render inside `<Num>`, which forces tabular
figures and LTR isolation so digits stay aligned in RTL tables. Dates are
stripped of the bidi control marks `Intl` injects, which otherwise scramble
`01/12/2025` into `012025/12/`.

## Layout

```
src/app/(app)/       one folder per route: page.tsx (server) + *-client.tsx
src/app/actions/     server actions, grouped by domain
src/lib/data/        types, repository, Postgres store, schema map
supabase/migrations/ SQL schema, applied by scripts/migrate.ts
scripts/             dev database, migration runner, self-checks
src/lib/             money, stock, dates, queries, i18n, labels
src/components/ui/   the design system
src/components/app/  shared feature components
```

`CONVENTIONS.md` documents the patterns. Read it before adding a page.

## Known gaps

- No authentication yet (release Phase 3).
- Purchase orders receive in full only — no partial receipts yet.
- Stock is valued at standard cost, not moving average. The Reports page says so.
- Writes are serialised by one advisory lock: right for a small team, not for
  hundreds of concurrent writers.
