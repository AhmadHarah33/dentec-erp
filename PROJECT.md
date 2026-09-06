# Project state

Last updated: 2026-09-04

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
