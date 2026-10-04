# Showcase (demo) copy of the ERP

A separate copy of the app, on its own throwaway database full of fictional
data, so people can click through it without touching real company data. The
real server (erp.dentec.cloud) never uses any of this.

**Never point the demo at the production database, the production tunnel or
any real credentials.** The seed script refuses a non-empty database and the
production addresses, but the safe habit is a database that exists only for the
demo.

## What demo mode changes

Setting `NEXT_PUBLIC_DEMO=1` when the app is built:

- hides the PDF download buttons and makes the PDF routes answer 503. PDFs need
  a headless Chromium, which a serverless host such as Vercel does not have.
  The **Print** buttons still work: they open the print view and use the
  browser's own "Save as PDF".
- shows a thin banner, "Demo version — all data is fictional", in Arabic or
  Turkish.

It adds and removes no permissions.

## Set it up

1. **Make an empty Postgres database** for the demo (Neon, a new Supabase
   project, or any host). Copy its connection string. Use the owner/admin role.

2. **Create the tables** (from this repo, on your PC):

   ```bash
   DATABASE_ADMIN_URL="postgres://…" npx tsx scripts/migrate.ts
   ```
   ```powershell
   $env:DATABASE_ADMIN_URL="postgres://…"; npx tsx scripts/migrate.ts
   ```

3. **Fill it with demo data.** `DEMO_PASSWORD` becomes the password of every
   demo account; choose it yourself (10+ characters).

   ```bash
   DATABASE_URL="postgres://…" DEMO_PASSWORD="…" DEMO_SEED_CONFIRM=yes npx tsx scripts/seed-demo.ts
   ```
   ```powershell
   $env:DATABASE_URL="postgres://…"; $env:DEMO_PASSWORD="…"; $env:DEMO_SEED_CONFIRM="yes"; npx tsx scripts/seed-demo.ts
   ```

   It creates 5 accounts, 8 customers, 3 suppliers, 12 products and parts, a
   year of purchase orders, invoices and payments, expenses, and a workshop board
   of service jobs — all through the app's own actions, so it is consistent.
   It stops with a message if the database is not empty.

   | Account | Use |
   |---|---|
   | `demo-owner@dentec.demo` | everything, for you |
   | `demo-viewer@dentec.demo` | read-only everywhere — the safe one to give to visitors |
   | `demo-accountant@dentec.demo`, `demo-sales@dentec.demo`, `demo-technician@dentec.demo` | to show what each role sees |

4. **Vercel → the project → Settings → Environment Variables** (Production):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the demo database's connection string (use its pooled/serverless one if it has one) |
   | `DATABASE_POOL_SIZE` | `1` |
   | `NEXT_PUBLIC_DEMO` | `1` |
   | `APP_URL` | the demo's public address |

   Then **redeploy** (a new build is needed: `NEXT_PUBLIC_` values are baked in
   at build time).

5. **Vercel → Settings → Deployment Protection**: turn protection off for
   Production, otherwise visitors are sent to a Vercel login before they see
   the app.

6. Open the address, sign in as `demo-viewer@dentec.demo`, and click around.

## Start over

Anyone signed in as the owner can change or delete demo data. To reset, empty
the **demo** database and seed again:

```sql
drop schema erp cascade;   -- on the DEMO database only
```

then repeat steps 2 and 3.
