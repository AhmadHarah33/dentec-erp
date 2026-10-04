# Showcase (demo) copy of the ERP

A copy of the app for showing people how it looks and works. It needs **no
database and no login**: the demo business ships inside the app and lives in
memory. The real server (erp.dentec.cloud) never uses any of this.

## Turn it on

Set one environment variable **when the app is built**:

```
NEXT_PUBLIC_DEMO=1
```

On Vercel: the project → Settings → Environment Variables → add
`NEXT_PUBLIC_DEMO` = `1` for Production → redeploy. (It has to be a new build:
`NEXT_PUBLIC_` values are baked in when the app is built.) Nothing else is
needed — no `DATABASE_URL`, no accounts, no passwords.

Also turn off **Settings → Deployment Protection** for Production, otherwise
visitors are sent to a Vercel login before they see the app.

## What a visitor sees

- The app opens straight on the dashboard, with a banner at the top:
  *Demo version — all data is fictional*.
- The banner has five buttons — **Owner, Accountant, Sales, Technician,
  Viewer** — to browse as each role. The permission table applies exactly as for
  a real person with that role, so the Technician has no invoices or accounting,
  the Viewer cannot change anything, and cost and margin appear only for the
  roles that may see them. Good for showing what each person on the team gets.
- The data is a fictional dental-equipment business: 8 customers (Syria and
  Turkey), 12 products and parts, a year of purchases, invoices and payments,
  expenses and a workshop board.
- Dates are moved forward every time the app starts, so "this month", "overdue"
  and the sales trend always look current.
- PDF download is hidden (PDFs need a headless Chromium, which Vercel does not
  have). **Print** still works and the browser can save it as a PDF.
- Visitors can click everything, including creating, issuing and voiding.
  Changes live in that running server instance only; a restart or a new
  instance goes back to the original data. Nothing a visitor does can damage
  the demo for the next person.

## Change the demo data

The data is `src/lib/data/demo-snapshot.json`. To regenerate it (for example
after changing `scripts/seed-demo.ts`), on a PC:

```bash
node --import tsx scripts/dev-db.ts &        # a throwaway local database
export DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres DATABASE_POOL_SIZE=1
DEMO_SEED_CONFIRM=yes DEMO_PASSWORD=anything-10-chars npx tsx scripts/seed-demo.ts
npx tsx scripts/build-demo-snapshot.ts       # writes src/lib/data/demo-snapshot.json
```

The snapshot holds business records only: no password hashes, sessions or
tokens. Commit the new file and redeploy.

## Safety

- Demo mode is off unless `NEXT_PUBLIC_DEMO=1` is set at build time; the real
  server never sets it, and with it off nothing here is reachable.
- It adds no permissions and removes none; the role buttons only pick which
  existing role to browse as.
- There are no real accounts, credentials or company data in it.

## Optional: a database-backed demo

`scripts/seed-demo.ts` can also fill an empty Postgres database with the same
fictional business (it refuses a database that has data and the production
addresses). That is only needed if you want a demo with real sign-in; the
default above does not.
