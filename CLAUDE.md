# CLAUDE.md

Dentec ERP — Next.js 15 App Router, TypeScript, Tailwind v4. Arabic-first RTL,
set in Cairo, white surfaces on a navy accent taken from the logo.

## Before writing code

Read `CONVENTIONS.md`. It is binding and covers the component kit, data
helpers, i18n rules and visual rules. Do not re-derive them.

## Commands

```bash
npm run dev            # localhost:3000
npm run build
npx tsc --noEmit       # must be silent before you call anything done
```

## Non-negotiables

- **Every user-visible string goes through `t()`.** Keys live in
  `src/lib/i18n/ar.ts`. Reuse existing keys; add new ones only to `ar.ts`.
- **Every number renders inside `<Num>`** — tabular figures + LTR isolation, or
  digits misalign in RTL tables.
- **Logical CSS only**: `ms-/me-`, `ps-/pe-`, `start-/end-`, `text-start/end`.
  Never `ml-`, `pr-`, `left-`, `text-left`.
- **Elevation is two faint steps only**: `shadow-card`, `shadow-pop`,
  `shadow-modal`. Everything else separates with 1px hairlines and whitespace.
- **`text-brand` (`#1b2350`) is the logo navy and belongs to the wordmark
  only. `accent` (`#2f5bd8`) is the working colour** — filled buttons, active
  nav, links, chart data.
- **A status never picks its own colour.** Map it to a `Tone` in
  `src/lib/labels.ts` and let the `Badge` render it.
- **Do not hardcode type sizes.** The scale lives in the `@theme` block of
  `globals.css`; `text-xs` is 14px body, `text-2xs` is 13px meta.
- **Never pass a function from a server page to a client component.** Pass
  `currency` and `locale` strings and format inside the client.

## Architecture facts that are easy to get wrong

- **Stock is an append-only ledger.** `stockMoves` is never mutated or deleted;
  on-hand is always derived by summing it. Corrections are opposing moves.
- **All storage goes through `src/lib/data/repository.ts`.** Never touch the
  filesystem from a page or action.
- **Store state lives on `globalThis`** (`src/lib/data/store.ts`). Next bundles
  server components and server actions separately, so a module-level `let`
  gives you two caches and stale renders. Do not "simplify" this back.
- **All money math lives in `src/lib/money.ts`.** Document discounts are spread
  across lines before tax, because lines carry different VAT rates.
- Server actions return `Result<T>`, never throw for expected failures.
- Dynamic route params are a Promise: `const { id } = await params;`

- **A row opens a drawer, not a page.** Lists pass `onRowClick` to
  `DataTable`; the drawer is read-only and its footer links to the full page.
  Editing navigates. See `src/components/ui/drawer.tsx`.
- **The sidebar holds thirteen destinations.** Configuration goes under
  `/settings` as a tab; a second view of the same data is a tab on its page.
- **The view role is not security.** `ViewRole` (owner/accounting/service) sits
  in a cookie and only reorders the dashboard.
- **Service jobs are a board, not a table.** Cards must support both drag and
  an explicit move menu — touch has no drag.

## Scope boundaries

There is no authentication. Roles are organisational only. Do not add auth
plumbing unless asked — it is planned to arrive with Supabase. The `ViewRole`
cookie is a display preference and must not grow into a permission system.
