# Dentec ERP

Inventory, sales, purchasing, service and light accounting for a dental
equipment business. Arabic-first (RTL), Turkish ready.

## Running it

```bash
npm run dev      # http://localhost:3000
npm run build && npm start
```

On first start the app writes `data/dentec.json` with twelve months of
realistic demo data. Delete that file to start clean; Settings → إعادة تعيين
lays the demo data down again.

## Deploying to your own server

```bash
npm ci
npm run build
DENTEC_DATA_DIR=/var/lib/dentec npm start
```

Then put a tunnel in front (`cloudflared tunnel --url http://localhost:3000`,
or Tailscale Funnel).

> **There is no login.** Anyone who can reach the tunnel URL has full access,
> accounting included. Put Cloudflare Access or a Tailscale ACL in front of it
> until Supabase Auth is added. The roles on the Users page organise the team;
> they do not restrict anything yet.

Back up by copying the data directory. That is the whole database.

## How it is put together

- **Next.js 15 App Router + TypeScript + Tailwind v4.** Mutations are Server
  Actions — there is no REST layer to maintain.
- **No runtime dependencies beyond React and Next.** Charts are hand-written
  SVG, icons are a local stroke set.

### Storage

Everything lives in one JSON file behind `src/lib/data/repository.ts`. Pages and
actions import from there and never touch the filesystem, so moving to Supabase
means writing one adapter and changing one line in `src/lib/data/store.ts`.

Writes are serialised through a queue and committed atomically (temp file +
rename), and a document plus its stock moves are written in a single
transaction — issuing an invoice cannot half-succeed.

Store state is held on `globalThis`. Next bundles server components and server
actions separately, and a module-level cache is instantiated once per bundle;
without the global you get two copies and an invoice you just issued keeps
rendering as a draft.

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
src/lib/data/        types, repository, JSON store, seed
src/lib/             money, stock, dates, queries, i18n, labels
src/components/ui/   the design system
src/components/app/  shared feature components
```

`CONVENTIONS.md` documents the patterns. Read it before adding a page.

## Known gaps

- No authentication (see the warning above).
- Purchase orders receive in full only — no partial receipts yet.
- Stock is valued at standard cost, not moving average. The Reports page says so.
- JSON storage suits a small team; it is not built for heavy concurrent writes.
