# Deploying Dentec ERP with self-hosted Supabase

This guide covers the setup this app was prepared for: Supabase running in
Docker on a ZimaOS server, exposed through a Cloudflare tunnel.

With no Supabase variables set, the app runs as an offline demo on sample data
(`data/dentec.json`). Once the variables are set it switches to Supabase, and
the demo data is never copied across: the real system starts empty.

---

## 1. Prepare Supabase

### 1.1 Turn off public sign-up

Accounts are created by the owner inside the app, so nobody should be able to
register themselves. In your Supabase stack's `.env`:

```env
DISABLE_SIGNUP=true
```

Restart the `auth` container afterwards. Even if sign-up were left on, an
account without a profile row sees nothing: row-level security gives it no
access. Still, turn it off.

E-mail (SMTP) is **not** required. Invites work with temporary passwords that
the owner hands over.

### 1.2 Create the schema

Open **Supabase Studio → SQL Editor**, paste the whole of
`supabase/migrations/20260927120000_dentec_init.sql` and run it.

Or from any machine that can reach the database:

```bash
psql "postgresql://postgres:<password>@<host>:5432/postgres" \
  -f supabase/migrations/20260927120000_dentec_init.sql
```

Running it again later is safe. It creates:

| Piece | Purpose |
|---|---|
| 12 tables (`profiles`, `items`, `sales_invoices`, …) | one per collection in `src/lib/data/types.ts` |
| Row-level security policies | the owner / accounting / service split, enforced in the database |
| `get_snapshot()` | returns everything the caller may see, in one round trip |
| `apply_changes()` | applies each save as one transaction, and refuses a stale write |
| Trigger on `stock_moves` | makes the stock ledger append-only, even for admins |
| Trigger on `profiles` | nobody can promote themselves, and the last owner can't be removed |

### 1.3 Collect three values

From your Supabase `.env`:

| App variable | Supabase `.env` | Notes |
|---|---|---|
| `SUPABASE_URL` | – | `http://kong:8000` if the app runs on the same Docker network, otherwise your public Supabase URL |
| `SUPABASE_ANON_KEY` | `ANON_KEY` | |
| `SUPABASE_SERVICE_ROLE_KEY` | `SERVICE_ROLE_KEY` | server-only; used to invite users and for first-run setup |

---

## 2. Run the app

### Option A: Docker on the same ZimaOS host (recommended)

```bash
cp .env.example .env          # fill in the three values above
docker network ls             # find the Supabase network, usually supabase_default
# edit deploy/docker-compose.yml if the network name differs
docker compose -f deploy/docker-compose.yml up -d --build
```

The app reaches Supabase over the internal network (`http://kong:8000`). No
request from a browser ever goes to Supabase directly, so **only the app
needs to be public**. You can remove Supabase's own public tunnel, or put
Cloudflare Access in front of Studio.

The image includes Chromium for PDF export and runs as a non-root user.

To change the business time zone (default `Europe/Istanbul`), rebuild with:

```bash
docker compose -f deploy/docker-compose.yml build \
  --build-arg NEXT_PUBLIC_TIME_ZONE=Asia/Damascus
```

### Option B: Vercel

Add the three variables in the Vercel project settings. `SUPABASE_URL` must
then be your **public** Supabase URL (the Cloudflare tunnel hostname). PDF
export needs Chromium, which Vercel's runtime doesn't have; everything else
works.

### Option C: Plain Node

```bash
npm ci && npm run build
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm start
```

---

## 3. Point the Cloudflare tunnel at the app

In Zero Trust → Networks → Tunnels, add a public hostname such as
`erp.your-domain.com` → `http://<zimaos-ip>:3000`. If you use Cloudflare
Access in front of it, the app keeps working, PDF export included: the image
renders PDFs against `APP_INTERNAL_URL`, so it never goes back out through the
tunnel.

---

## 4. First run

1. Open the app. With an empty database it sends you to **/setup**.
2. **Step 1:** company name, base currency, default VAT, main warehouse name.
3. **Step 2:** your name, e-mail and password. This account is the owner.
4. You land on the dashboard and the walkthrough starts.

`/setup` closes permanently once the first owner exists.

## 5. Adding the team

**Settings → Users → Invite user.** Enter name, e-mail and role. The app
shows a temporary password **once**; send it to the person yourself. At their
first sign-in they must choose their own password, and then their role's
walkthrough starts.

| Role | Can use | Cannot |
|---|---|---|
| Owner (المالك) | everything | – |
| Accounting (المحاسبة) | invoices, purchases, suppliers, payments, expenses, reports, catalog, stock; can view service jobs and invoice them | settings, users |
| Service (الصيانة) | service board, spare parts and products (no prices), stock levels (no values), customers (no balances) | anything with money, settings |

Deactivating a user (or "deleting" one: with Supabase nothing is hard-deleted)
blocks their sign-in immediately and keeps their name on past jobs.
**Reset password** issues a new temporary password.

## 6. Backups

Everything is in Postgres. Use your usual Supabase backup (for example a
nightly `pg_dump` of the `public` schema plus `auth.users`).

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| /setup says the database isn't set up | the migration hasn't been run on this database |
| /setup asks for `SUPABASE_SERVICE_ROLE_KEY` | the variable is missing from the app's environment |
| Sign-in says it can't reach the data server | `SUPABASE_URL` is wrong, or unreachable from the app container |
| A user signs in but sees nothing | their profile is inactive, or was created outside the app |
| PDF download fails with `render_failed` | Chromium isn't available: set `CHROMIUM_PATH`, or use the Docker image |
