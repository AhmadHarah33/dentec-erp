# Project state

Last updated: 2026-09-08

## What this is

ERP for Dentec, a dental equipment business: sells machines, stocks spare parts
for them, serves clinics, and repairs equipment. Runs on the owner's own server,
exposed through a tunnel. Arabic now, Turkish later.

## Decisions made (do not re-litigate)

| Area | Decision |
|---|---|
| Hosting | Self-hosted, tunnel in front |
| Database | None yet — JSON file behind a repository interface; Supabase (self-hosted, via CLI) later |
| Accounting | Invoices, payments, balances. No double-entry |
| Auth | **None in v1.** Users and roles exist as data only |
| Invoicing | Per-line VAT, discounts, printable A4, multi-currency |
| Visual style | White surfaces on a cool near-white canvas, single navy accent taken from the logo, Cairo, faint two-step elevation |
| Currency | Base currency in Settings, default USD |

## Status: complete and working

24 routes. Typecheck clean. Verified end-to-end against the data file:

- Invoice draft → issued → partial → paid; stock decremented, one `sale` move
- Purchase order received; every line incremented exactly
- Service job consumed a part; spare-part stock decremented
- Data survives a server restart
- Arabic RTL and Turkish LTR both mirror cleanly, no horizontal overflow

## Design pass — 2026-09-04

The clinical teal-on-off-white scheme was replaced after a review against
reference Arabic dashboards. Four decisions, all made by the owner:

1. **Cairo** replaces IBM Plex Sans Arabic. Its taller x-height is why 14px
   body text now reads comfortably where 12px Plex did not.
2. **The type scale grew one full step.** Body and table text 12→14px, meta
   11→13px, page titles 18→24px. The utility names did not change, only the
   values behind them in `@theme`, so all 24 routes inherited it.
3. **Navy `#1b2350`, straight off the logo, is the only accent.** The teal is
   gone. Neutrals were re-cut cool to sit under it.
4. **Shadows are allowed again**, as two deliberately faint steps, and the
   radius went 4px → 8/12px. The old "no shadows anywhere" rule is retired;
   `CONVENTIONS.md` carries the replacement.

Also in this pass: touch targets went to 40px minimum (rows 44px), the sidebar
widened to 240px and gained a per-destination icon set drawn in the existing
house style, and `.num` picked up `white-space: nowrap` so document numbers
stop breaking at their hyphens at the larger size.

## Redesign pass 2 — 2026-09-04

The first pass fixed how the app looked; this one fixes how it works. The
complaint was that the ERP felt complicated and hard to check at a glance.
Root cause: the dashboard was six equal-weight cards with no hierarchy and no
actions — a report, not a workspace. Decisions, all the owner's:

1. **The dashboard is attention-first.** Four tiles for the four things that
   can be wrong (overdue receivables, stock below minimum, open service jobs,
   purchase orders not received), then three queues you can empty, then
   performance last. Each tile and each row links to the record that clears it.
2. **Colour carries status.** `Tone` gained `success`, and the four status maps
   in `labels.ts` were re-cut so paid reads green, in progress blue, waiting
   amber, wrong red. The old "accent only, never decorative" rule is retired.
3. **The brand split in two.** Navy `#1b2350` is the wordmark; a lighter
   `#2f5bd8` does the work of fills, links and chart data. Solid navy buttons
   read as black slabs at this size.
4. **The sidebar collapses.** Sixteen destinations in six groups, only the
   group you are in is open. Deliberately opening another keeps it open.
5. **The top bar earns its space** — global search over invoices, customers,
   suppliers, items and jobs (client-side over a server-built index in
   `src/lib/search.ts`), plus a quick-create menu.

New shared components: `ListCard` / `ListRow` (a queue with a "view all"
foot), `Segmented` (pill tabs), and a rebuilt `StatTile` that takes an icon,
a tone and a verdict chip. KPI money uses the new `formatMoneyCompact`.

**Rollout, same day.** The language now reaches every list page:

- `Column` gained a `tertiary` priority (hidden under `xl`) alongside
  `secondary` (hidden under `md`). Reference data — due dates, currencies,
  serial numbers, technicians, contact details, payment methods, per-warehouse
  breakdowns — moved to `tertiary`. Visible columns at 1200px: invoices 8 → 6,
  service 8 → 5, inventory 9 → 5, customers 7 → 4, accounting 7 → 5.
- Every `StatTile` across invoices, purchases, service, inventory, parties,
  accounting and reports now carries an icon, a tone and, where there is a
  verdict, a chip. KPI money is compact.
- The hand-rolled tab strip in accounting and the range dropdown in reports are
  both `Segmented` now.
- The sales chart was rebuilt: a real value axis with rounded ticks, a gradient
  area, round dots, a tooltip anchored to the hovered point, and labels that
  thin in three steps so twelve months fit a phone. Each point carries an
  `aria-label` with its exact figure, which is the accessible reading of the
  chart.

## Redesign pass 3 — 2026-09-06

Discovery first: workflows, screen inventory, then build. Decisions taken with
the owner:

- **16 sidebar destinations → 13.** Stock moves became a tab on Inventory;
  warehouses and users moved under Settings (`/settings/warehouses`,
  `/settings/users`). Products and spare parts stay separate — a part carries
  which machines it fits and is consumed rather than sold.
- **Drawer to look, page to edit.** Every list row opens a read-only drawer;
  filters and scroll position survive. Wired into invoices, purchases,
  customers, suppliers, products, spare parts.
- **A view-role pill** (owner / accounting / service) in the top bar, in the
  mobile nav drawer below `sm`. Cookie-backed, same mechanism as the locale.
  Reorders the dashboard only — explicitly not security.
- **Service became a kanban board.** Five working columns; delivered behind a
  toggle. Drag on desktop, move menu on touch, optimistic card movement.
- **Two workflow features**, verified end-to-end against the demo data:
  job → draft invoice (parts + labour, no double stock deduction), and
  shortage → draft purchase orders grouped by supplier and linked back to the
  job.

Model additions: `PurchaseOrder.serviceJobId?`, `ServiceJob.invoiceId?` — both
optional, so existing rows stay valid.

Testing those flows left three records in the demo data: INV-2026-0080,
PO-2026-0017, and an extra part on SRV-2026-0017. Settings → reset demo data
clears them.

## Dual-region billing and PDF — 2026-09-08

### The route "403" was not a route problem

Reported symptom: `/products`, `/spare-parts` and `/service/srv19` return 403
or are otherwise unreachable. Probed rather than guessed, and the app is not
the thing refusing.

There is no `middleware.ts`, no `vercel.json`, and `next.config.mjs` has no
`rewrites`, `redirects`, `headers` or `basePath`. Nothing in `src/` returns 403
— `grep` finds only `notFound()` and one `redirect()` on a non-draft invoice
edit. Locally every route answers 200:

```
200  /   200  /products   200  /spare-parts   200  /service   200  /invoices
404  /service/srv19
```

That 404 is correct. Service ids are `"srv" + n` assigned in seed order, and
the seed writes 17 jobs, so `srv19` has never existed. The count is not fixed
either: `buildSeed()` skips any generated date later than today, so the number
of jobs drifts as the calendar moves, and an id that resolved last month can
404 this month. On Vercel it is worse — each cold instance re-seeds its own
in-memory copy, so a detail URL is only valid against the instance that minted
it.

**So a 403 reaching the browser is coming from in front of the app** — the
Cloudflare tunnel, or Vercel Deployment Protection on a preview URL. That is
where to look; there is no code fix, and none was made.

### Regions

`billingRegion: "TR" | "SY"` now sits on both the customer and the invoice.
Both are optional, so rows written before this stay valid, and
`resolveRegion()` in `src/lib/billing/region.ts` is the single place the "an
unmarked party is domestic" assumption is made. The invoice carries its own
copy and freezes it: re-domiciling a customer must not rewrite invoices
already issued to them.

- **TR** (`turkey` profile): VKN/TCKN with real check-digit validation, Vergi
  Dairesi, Ticaret Sicil No, GİB mailbox alias, Mersis. Document type is
  *derived, not chosen* — a buyer in the GİB e-Fatura user list must receive an
  `e_fatura` and one outside it an `e_arsiv`; sending the wrong one gets the
  document rejected. `e_irsaliye` carries a dispatch block and is the only type
  that needs one.
- **SY** (`syria` profile): commercial register, import licence, customs post,
  exemption wording. Export sales are zero-rated at origin, priced in USD/EUR,
  and the total is restated in a second currency at a stated rate.

`complianceIssues()` returns every gap in one pass rather than throwing on the
first, so the invoice page lists them all at once. `buildUblPayload()` produces
the UBL-TR 1.2 tree — `Invoice` for e-Fatura/e-Arşiv, `DespatchAdvice` for
e-İrsaliye — named as UBL names it and stopping there. No XML, no credentials,
no network: the transport is the integrator's problem (Uyumsoft / Logo /
Foriba) and swapping between them should not reach past that one file.

### PDF: HTML through a real browser

`@react-pdf/renderer` was considered and rejected. This document is Arabic
first, and Arabic needs contextual glyph shaping plus bidi reordering of the
Latin SKUs and figures embedded in it. Chromium already does both, correctly,
with the Cairo webfont the app is already set in. Playwright renders
`/print/[kind]/[id]` — a server component with no app shell — and
`/api/{invoices,purchases}/[id]/pdf` streams the result back. The browser is
cached on `globalThis` for the same reason the store is.

Verified: Cairo embeds as CID subsets, Arabic joins correctly, and the TR,
SY, e-İrsaliye and purchase-order variants all render.

### Bugs found while building this

1. **The VKN check digit was off by one.** Positions in the GİB algorithm are
   1-based and the offset is `10 - position`, so the leftmost digit shifts by
   9, not 10. The first draft used the loop index directly. It produced
   plausible numbers that every real system rejects, and nothing on screen
   would have shown it — `npm run check` exists because of this. Worth knowing:
   the algorithm collapses two intermediate values onto 9, so it catches ~98 %
   of single-digit typos, not all of them. It is a screen against fat fingers,
   not proof the number is real.
2. **`"منذ 2 يومين"`.** The first pass at pluralisation interpolated the
   numeral and the noun separately. But Arabic's singular and dual *already*
   carry their count — "يومين" is "two days" — so writing the digit too reads
   as "two two-days". `countedPhrase()` returns the whole phrase and omits the
   numeral for 1 and 2. Turkish keeps its numeral always.
3. **Mixed-script identifiers reordered on the printed sheet.** A plate
   "34 ABC 123" came out "ABC 123 34" and a phone "+90 553 636 2468" came out
   "2468 636 553 90+": digits and Latin letters form separate bidi runs inside
   an Arabic paragraph. Identifier fields are LTR-isolated (`.num`) now; prose
   deliberately is not.
4. **A purchase order was printing a Turkish VKN block for a Chinese
   supplier**, and Dentec's customer warranty terms. A PO has no region of its
   own — it gets the plain tax number, and no warranty.

### Note when pulling this

`data/dentec.json` predates these fields. Settings → reset demo data
regenerates it with regions, tax profiles and the bank/IBAN footer; without
that, existing rows simply fall back to TR and the footer rows stay blank —
valid, just not showing the new work.

Playwright's Chromium must be present: `npx playwright install chromium`.
Without it the PDF route returns a JSON error saying so rather than a broken
download.

## Bugs found and fixed (context for future work)

1. `Intl` injects bidi control marks into Arabic dates, scrambling `01/12/2025`
   into `012025/12/`. Stripped in `src/lib/dates.ts`.
2. `w-full` in the control base class beat `w-36` overrides at call sites.
   Control width now defaults from a base-layer CSS rule so utilities win.
3. Next bundles server components and server actions separately, so the
   module-level data cache existed twice — actions mutated one copy while pages
   rendered the other, and a freshly issued invoice kept showing as a draft.
   Store state now lives on `globalThis`.
4. `.num` had no `white-space`, so once body text grew to 14px a document
   number wrapped at its hyphens into `INV-` / `2026-` / `0079`. A figure run
   is one token; the class now says so.
5. `cn()` is a plain join, not `tailwind-merge`, so `className="hidden
   sm:inline-flex"` on a `LinkButton` lost to the `inline-flex` already in its
   base class and the dashboard's secondary buttons never hid on a phone. Hide
   by wrapping, not by overriding.
6. The old `LineChart` drew its hover dot inside a `preserveAspectRatio="none"`
   viewBox, which stretches a circle into an ellipse. Dots, ticks and the
   tooltip are HTML over the SVG now.
7. `.gitignore` carried a bare `data/` to exclude the runtime JSON store. That
   pattern matches a directory of that name at ANY depth, so it also excluded
   `src/lib/data/` — the whole storage layer. The first push was unbuildable.
   Anchored to `/data/`.
8. Every route that reads data returned 500 on Vercel. Two faults, described
   in full below.

## Why the hosted copy 500'd, and why it forgets

Both symptoms have one cause: **on Vercel the application directory is
read-only.** The bundle is unpacked at `/var/task` and only `/tmp` accepts
writes. `store.ts` resolves `DATA_DIR` to `path.resolve(process.cwd(), "data")`
= `/var/task/data`, and on a cold start with no JSON file present it tries to
lay down the seed there.

Two things went wrong on top of that.

**The errno was not the one being checked.** The read-only guard recognised
`EROFS`, `EACCES` and `EPERM`. Vercel's overlay answers
`fs.mkdir('/var/task/data', { recursive: true })` with **`ENOENT`**. That looks
like "missing parent directory", but a recursive mkdir creates missing parents
by definition, so it cannot fail for that reason — `ENOENT` there means the
path cannot be created at all, which is `EROFS` under another name. It is now
classified as unwritable, along with `ENOTDIR`.

The reason this survived a local test is worth remembering: the simulation
pointed `DENTEC_DATA_DIR` at a Windows system path, which fails with `EPERM` —
a code the guard already handled. The test passed while production stayed
broken. Reproducing the *symptom* is not the same as reproducing the *cause*;
the honest local repro is a recursive mkdir on a non-existent drive, which
does return `ENOENT`.

**A throw inside a catch is not caught by its own try.** The seed write runs in
the `catch` block of `readFromDisk`, so when `writeToDisk` threw, nothing
handled it — it propagated out of `getDb()` and took down every page that calls
`snapshot()`, which is every route under `(app)`. A later catch-all added to
the same catch block could never have helped. The seed write is now guarded on
its own.

The diagnosis came from a temporary `/api/health` endpoint that reported the
resolved paths and the errno of each filesystem step. The runtime logs were not
reachable, and three rounds of guessing had already been wrong; one probe
answered it. The endpoint was deleted immediately afterwards.

**What this means day to day.** On Vercel the in-memory cache IS the database.
It is seeded from `buildSeed()` on cold start, accepts every mutation for the
life of that instance, and is discarded when the instance recycles. Two
concurrent instances do not share state. So the hosted copy is a demo that
forgets: fine for checking layout and flow on a phone, useless as a record.
Local development is unaffected — the disk is writable and every write lands in
`data/dentec.json`.

Making it remember requires storage that is not the local filesystem. That is
the Supabase migration, and it is a change to `store.ts` only.

## Open items

- **No authentication.** The tunnel URL is fully open, accounting included.
  Needs Cloudflare Access or a Tailscale ACL in front until Supabase Auth lands.
  This was the user's explicit choice, not an oversight.
- Purchase orders receive in full only — no partial receipts.
- Stock valued at standard cost, not moving average. Reports says so on screen.
- JSON storage suits a small team; not built for heavy concurrent writes. The
  repository interface is what keeps the Supabase move cheap.
- `tr.ts` is a partial translation that falls back to Arabic. Finishing Turkish
  is a translation pass over that one file, not a code change.

## Next likely steps

1. Supabase migration: write `supabase-adapter.ts` against the same repository
   interface, swap one line in `src/lib/data/store.ts`.
2. Auth on top of Supabase, then enforce the existing role map server-side.
3. Partial receipts on purchase orders.
