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
  only. `accent` (`#1a224d`, the same logo navy) is the working colour** —
  filled buttons, active nav, links, chart data.
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
  filesystem or Supabase from a page or action. Behind it sit two stores with
  one contract: `store-supabase.ts` when `SUPABASE_URL` + anon key are set,
  `store.ts` (JSON demo) otherwise. A write is a callback that edits a
  snapshot; the Supabase store diffs it and applies it with `apply_changes()`
  in one version-checked transaction, retrying on conflict — so the callback
  must be safe to run twice.
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
- **Roles are permissions.** `Role` = owner / accounting / service. The table
  is `src/lib/permissions.ts`; pages call `requireSection()`, every server
  action starts with `deny(capability)`, client components hide with
  `useRole().can()`. With Supabase, RLS in `supabase/migrations` enforces the
  same split — change both together. In demo mode the role comes from a cookie
  (the account menu's "act as" list) so every role can be tried offline.
- **Service staff never see money.** Gate prices, costs, balances and stock
  value on `can("money.view")`.
- **Service jobs are a board, not a table.** Cards must support both drag and
  an explicit move menu — touch has no drag.

- **Schema changes are migrations.** Add a new file under
  `supabase/migrations/`, and a new field on a type in `types.ts` needs a
  column (camelCase field ↔ snake_case column, mapped in `store-supabase.ts`).
  An optional TS field (`field?:`) must be listed in `OPTIONAL` there.

## Scope boundaries

Authentication is Supabase email + password, created by the owner (no public
sign-up, no SMTP required). Deployment is described in `docs/DEPLOY.md`. The
first-login walkthrough lives in `src/components/app/tour.tsx`; its targets
are `data-tour` attributes, so renaming a nav item or moving the search box
means checking the tour.
