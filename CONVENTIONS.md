# Dentec ERP — conventions

Read this before writing any page. Match it exactly; consistency is the point.

## Structure

- Server page at `src/app/(app)/<route>/page.tsx` loads data and passes plain
  serialisable props to a client component in the same folder,
  `<route>-client.tsx`. **Never pass a function from a server page to a client
  component** — it throws at runtime. Pass `currency` and `locale` strings and
  format inside the client.
- Mutations live in `src/app/actions/*.ts` and already exist. Do not write new
  ones. They return `Result<T>` = `{ok:true,data} | {ok:false,errorKey,detail?}`.
- Dynamic route params are a Promise: `{ params }: { params: Promise<{id:string}> }`,
  then `const { id } = await params;`.

## Data access

```ts
import { snapshot } from "@/lib/data/repository";   // whole DB, server only
import { getI18n } from "@/lib/i18n/server";        // { locale, t }
const { locale, t } = await getI18n();
const db = await snapshot();
```

`db` has: settings, users, categories, items, warehouses, stockMoves,
customers, suppliers, salesInvoices, purchaseOrders, payments, expenses,
serviceJobs. See `src/lib/data/types.ts`.

## Helpers — use these, do not reimplement

- `src/lib/money.ts` — `computeTotals(lines, discountKind, discountValue)`,
  `formatMoney(n, currency, locale)`, `formatNumber`, `round2`, `toBase(amount, fxRate)`,
  `rateFor(settings, code)`
- `src/lib/dates.ts` — `formatDate`, `formatMonth`, `formatDateTime`, `today()`,
  `addDays`, `lastMonths`, `isInMonth`, `daysOverdue`
- `src/lib/queries.ts` — `invoiceTotalBase`, `purchaseTotalBase`, `paymentBase`,
  `expenseBase`, `invoiceOutstanding`, `customerBalance`, `supplierBalance`,
  `agingByCustomer`, `salesByMonth`, `salesByItem`, `salesByCustomer`, `isLive`
- `src/lib/stock.ts` — `buildStockIndex(db.stockMoves)` once, then
  `onHand(index, itemId, warehouseId?)`, `lowStock`, `stockValue`, `stockHealth`
- `src/lib/labels.ts` — `localName(record, locale)` for anything with
  nameAr/nameTr, `categoryPath`, plus `INVOICE_TONE`/`PURCHASE_TONE`/`SERVICE_TONE`/
  `MOVE_TONE` and `invoiceKey`/`purchaseKey`/`serviceKey`/`moveKey` for badges,
  and the enum arrays (`INVOICE_STATUSES`, `EXPENSE_CATEGORIES`, `UNITS`, …)

## UI kit — use these, do not invent components

`@/components/ui/primitives` — `Button` (variant primary|default|ghost|danger,
size sm|md), `LinkButton`, `Input`, `NumberInput`, `Select`, `Textarea`, `Field`
(label/hint/required), `Badge` (tone neutral|accent|danger|warn|muted), `Dot`,
`Card`, `CardHeader`, `Num`.

`@/components/ui/page` — `PageHeader` (title/subtitle/actions), `StatTile`
(label/value/meta/delta/tone/icon/chip/href), `ListCard` + `ListRow` (a queue
with a "view all" foot), `EmptyState`, `DetailRow`, `SectionTitle`, `Toolbar`.
A `StatTile` should carry an `icon` and, when it can be judged good or bad, a
`chip` — the tile is meant to be read without reading its label.

`@/components/ui/table` — `DataTable<T>` with `Column<T>` =
`{key, header, align?, sort?, search?, render, width?, secondary?, tertiary?}`.
**A table shows three columns on a phone and five on a desktop.** Mark the
rest `secondary` (hidden under `md`) or `tertiary` (hidden under `xl`);
anything a user looks up rather than scans — reference numbers, contact
details, payment method, per-warehouse breakdowns — is `tertiary` and lives on
the detail page.
Props: `rows, columns, rowKey, onRowClick?, filters?, emptyTitle?,
emptyAction?, pageSize?, footer?, dense?, searchable?`. There is deliberately
no `href`: rows open a drawer, never a page.

`@/components/ui/modal` — `Modal` (open/onClose/title/description/footer/width),
`Confirm`.

`@/components/ui/drawer` — `Drawer` + `DrawerSection`. **Drawer to look, page
to edit.** A list row opens a read-only drawer over the list (`onRowClick` on
`DataTable`, not `href`), so filters and scroll position survive a look-up;
editing is the one thing that navigates. Side panel from `sm` up, bottom sheet
below it. Do not put editable fields in a drawer.

`@/components/ui/tabs` — `PageTabs`, for sibling pages that belong to one
subject. Tabs are real links with their own URLs; the sets are declared once in
`src/lib/tabs.ts` (`STOCK_TABS`, `SETTINGS_TABS`).

`@/components/ui/charts` — `LineChart`/`BarList` take `points: {label,value,meta?}[]`
plus `currency` and `locale` (NOT a format function), `StackBar`. `LineChart`
draws its own value axis, so give it room; its dots and tooltip are HTML over a
stretched SVG, because a circle inside `preserveAspectRatio="none"` is an
ellipse.

`@/components/ui/icons` — IconPlus, IconEdit, IconTrash, IconPrint, IconSearch,
IconCheck, IconClose, IconAlert, IconChevronEnd/Start, IconArrowUp/Down, IconBox,
IconFilter, IconExternal, IconGlobe, plus the nav glyphs (IconDashboard, IconTag,
IconTooth, IconWrench, IconLayers, IconSwap, IconWarehouse, IconDocument,
IconCart, IconUsers, IconTruck, IconCoins, IconChart, IconUser, IconSettings).

## Navigation and the view role

Thirteen sidebar destinations, no more. Configuration that changes a few times
a year (warehouses, users) lives under `/settings` as a tab; a view of a page
you are already on (the stock ledger) is a tab on that page. Anything you add
must earn a permanent slot in a list read every day.

`src/lib/roles.ts` — `ViewRole` = owner | accounting | service, in a cookie,
read on the server with `getViewRole()` from `roles.server.ts` and exposed to
the client through `RoleProvider`/`useRole`. **It is a view preference, not
security**: it reorders the dashboard and nothing else. No page is hidden, no
action is blocked. Real permissions arrive with Supabase; do not build them on
top of this.

## Motion

Two durations and one curve, declared in the `@theme` block: `--dur-swift`
(160ms, something answering a click) and `--dur-glide` (260ms, something
travelling across the screen), on `--ease-settle`, which decelerates only —
nothing in this app overshoots or bounces.

Use the utilities, do not hand-roll a keyframe: `anim-fade` (backdrops),
`anim-pop` (menus and popovers), `anim-rise` (dialogs), `anim-sheet` (a phone
bottom sheet), `anim-slide-start` / `anim-slide-end` (panels pinned to an
edge). The slide direction is resolved from `--from-start` / `--from-end` on
the root, because "start" is a different physical direction in Arabic — and
because a `[dir="rtl"] .anim-slide-end` override would silently miss the
responsive form, whose class is literally named `sm:anim-slide-end`.

`prefers-reduced-motion: reduce` collapses every animation and transition to
0.01ms globally. Nothing disappears, it just stops travelling.

Animations are enter-only. Closing is immediate, because an exit transition
needs the element to outlive its own state and none of these dialogs are worth
that machinery.

In Tailwind v4 `rotate-45` compiles to the standalone `rotate` property, not
`transform` — a transition that lists only `transform` will snap.

## Two layout traps this app has already hit

**`backdrop-filter` captures `position: fixed`.** The top bar uses
`backdrop-blur`, which makes it the containing block for every fixed
descendant. A dialog rendered inside it resolves `fixed inset-0` against the
64px header, not the viewport. Anything fixed that lives in the header must be
portalled to `<body>` — see `MobileNav`.

**A grid or flex item will not shrink below its content.** `min-width: auto` is
the default, so an `overflow-x-auto` wrapper inside a grid item does nothing:
the item grows instead, and on a phone that widens the whole page. `Card` and
the `DataTable` shell carry `min-w-0`; any new grid or flex wrapper around wide
content needs it too. `main` also carries `overflow-x-clip` as a backstop.

**Phones show three columns.** `secondary` is not optional decoration — a table
with four default columns overflows at 390px. Identity on a phone is usually
the name, not the serial number: on invoices the number is `secondary` and the
customer is not.

## The service board

`@/components/app/service-board` renders jobs as columns by stage. Cards are
draggable on a pointer device and every card also carries an explicit move
menu, because touch has no drag — any board you add needs both. `delivered` is
not a column: a column that only grows is a column nobody reads.

Two workflows live in `src/app/actions/service-workflow.ts`:

- `invoiceJob` — a draft invoice from a job's parts and labour. Parts already
  **consumed** become description-only lines (`itemId: null`), because
  `issueInvoice` deducts every line that carries an itemId and the unit already
  left through a `service` move. Unconsumed parts keep their itemId.
- `orderShortage` — draft purchase orders for what a job is missing, one per
  supplier, each carrying `serviceJobId` back to the job. The supplier is
  inferred from purchase history, which is why the order is a draft.

`src/lib/service.ts` derives shortages (`jobShortages`, `shortagesByJob`).
Consumed parts never count as a shortage — they are already out of stock.

## Client component shape

```tsx
"use client";
import { useT } from "@/lib/i18n/context";
const t = useT();
const [pending, startTransition] = useTransition();
startTransition(async () => {
  const result = await someAction(...);
  if (result.ok) setOpen(false);
  else setError(t(result.errorKey as MessageKey));
});
```
`MessageKey` comes from `@/lib/i18n`.

## Text and i18n

**Every user-visible string goes through `t("some.key")`.** Never hardcode Arabic
or English in a component. Keys live in `src/lib/i18n/ar.ts` — read it first and
reuse existing keys. If you genuinely need a new key, add it to `ar.ts` (and only
`ar.ts`; Turkish falls back automatically).

## Visual rules — non-negotiable

- **Typeface is Cairo**, loaded in `src/app/layout.tsx` and exposed as
  `--font-cairo`. Never set a font family in a component.
- **Type scale.** The utility names are historical; the sizes below are the
  contract, and they are defined once in the `@theme` block of `globals.css`.
  Change them there, never at a call site.
  | Utility | Size | Use |
  |---|---|---|
  | `text-2xs` | 13px | labels, badges, meta, table headers |
  | `text-xs` | 14px | body text and every table cell |
  | `text-sm` | 16px | card titles, section headings, the wordmark |
  | `text-base` | 17px | document totals |
  | `text-lg` | 24px | the page title, once per page |
- **Touch targets are 40px minimum.** Controls and buttons `h-10`, small
  buttons `h-9`, table rows `h-11`, header rows and card headers `h-12`,
  the topbar and sidebar wordmark `h-16`.
- **Elevation is two steps and faint.** `shadow-card` for cards, tables, stat
  tiles and raised buttons; `shadow-pop` for tooltips and popovers;
  `shadow-modal` for dialogs and the mobile drawer. Nothing else has a shadow,
  and hairline borders still carry most of the separation.
- Radius: `rounded-lg` (12px) for cards, tables and dialogs, `rounded-sm` (8px)
  for controls, buttons and sidebar items, `rounded-full` for badges and pills.
- **Two brand colours, both the same navy off the logo, and they do different
  jobs.** `text-brand` (`#1b2350`, straight off the logo) is the wordmark and
  nothing else. `accent` (`#1a224d`, also straight off the logo) is the
  voice: filled buttons, active navigation, links and chart data.
  `accent-strong` is its hover, `accent-soft` its tint.
- **Status colour is information, not decoration.** Every state maps to a
  `Tone`: `accent` in progress, `success` finished and correct, `warn` needs a
  look, `danger` wrong, `muted` inactive, `neutral` otherwise. The maps live in
  `src/lib/labels.ts` (`INVOICE_TONE`, `PURCHASE_TONE`, `SERVICE_TONE`,
  `MOVE_TONE`) — a status must never be given a colour at the call site.
  Each tone is a trio (`text-x`, `bg-x-soft`, `border-x-line`) and every text
  colour clears 4.5:1 on white and on its own tint.
- Every number renders inside `<Num>` — it applies tabular figures, LTR
  isolation and `nowrap`, so digits stay aligned inside RTL and a document
  number never breaks at its hyphens.
- **Logical properties only**: `ms-/me-`, `ps-/pe-`, `start-/end-`, `text-start`,
  `text-end`, `border-s/border-e`. Never `ml-`, `pr-`, `left-`, `text-left`.
- Muted text `text-muted`, faint `text-faint`. Both clear 4.5:1 on white; do
  not reach for a lighter grey.
- Tailwind colour tokens available: canvas, surface, sunken, line, line-strong,
  ink, muted, faint, accent, accent-strong, accent-soft, accent-line, danger,
  danger-soft, danger-line, warn, warn-soft, warn-line.
- Sidebar entries carry an icon from `@/components/ui/icons` plus a label. New
  glyphs are drawn on the same 16px grid at stroke 1.25 — do not import a pack.
- **Money on a KPI tile uses `formatMoneyCompact`; everywhere else uses
  `formatMoney`.** A rounded figure is for scanning. A figure that is being
  checked — a table cell, a document total, a report line — is always exact.
  Chart axis ticks use `formatNumberCompact`: the currency is already implied.
- **Three or four exclusive choices are a `Segmented`, not a `Select`** — the
  current choice should stay visible.
- **`cn()` is a plain join, not `tailwind-merge`.** A utility passed at a call
  site does not reliably beat one already in a component's base class, so you
  cannot hide a `Button` with `className="hidden sm:inline-flex"`. Wrap it.

## Verify before reporting done

Run `npx tsc --noEmit` from the repo root. It must be silent.
