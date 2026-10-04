# Deploying the ERP

Production runs on the ZimaOS box (`10.240.0.1`) as two Docker containers:

- `dentec-erp` — the Next.js app plus Chromium for PDFs. Joins Supabase's
  network (`supabase_default`) to reach the database container `db`, and a
  private network `dentec-erp-edge`.
- `dentec-erp-tunnel` — `cloudflared`, on the private network only. Public
  hostname `erp.dentec.cloud` → `http://app:3000`. Supabase is never public.

Everything lives in `/DATA/AppData/dentec-erp/` on the box: `src/` (copy of the
repo), `deploy.sh`, `.env.app` (database URL), `.env.tunnel` (tunnel token),
`secrets/`, `backups/`, `migrations/`. Env files are mode 600; never commit them.
The box has no `docker compose` and no Node; `deploy.sh` uses plain docker.

SSH: `ssh -i ~/.ssh/dentec_deploy Ahmed-Arslan@10.240.0.1` (docker works without sudo).

## Update to a new version

1. From the repo root on your PC, copy the source. The excludes are anchored
   with `./` on purpose: a bare `data` would also drop `src/lib/data`.
   ```bash
   tar --exclude=./node_modules --exclude=./.next --exclude=./.next-build --exclude=./.git \
       --exclude=./.claude --exclude=./docs --exclude=./data --exclude='./.env*' \
       --exclude='*.tsbuildinfo' --exclude=./.check-out -czf - . \
     | ssh -i ~/.ssh/dentec_deploy Ahmed-Arslan@10.240.0.1 \
       'cd /DATA/AppData/dentec-erp && rm -rf src && mkdir src && tar xzf - -C src'
   ```
2. If the release adds a migration, apply it first (see below).
3. On the box: `cd /DATA/AppData/dentec-erp && ./deploy.sh`. It rebuilds the image,
   recreates both containers and leaves Supabase untouched. A few seconds of
   downtime while the app restarts.

## Migrations

New files in `supabase/migrations/` only; applied ones are never edited. Take a
backup first (`./backup.sh`), then run `scripts/migrate.ts` as the database
owner (see its header for `DATABASE_ADMIN_URL`). Record applied files with
`migrations/_record-migrations.sql`.

## Logs, restart, status

```bash
docker ps --filter name=dentec-erp
docker logs -f dentec-erp          # app
docker logs -f dentec-erp-tunnel   # tunnel
docker restart dentec-erp
```

## Backup and restore

`backup.sh` dumps only the `erp` schema (custom format, verified readable) every
night at 02:30 from the deploy user's crontab, keeps 30 days, in `backups/`.
Backups sit on the same box; copy them off it periodically.

- Take one now: `/DATA/AppData/dentec-erp/backup.sh`
- Prove a backup restores: `/DATA/AppData/dentec-erp/restore-test.sh` (restores
  into a scratch database, compares row counts, drops it).
- Real restore: stop the app (`docker stop dentec-erp`), restore the dump with
  `pg_restore` into `erp` as the database owner, start the app. Take a fresh
  backup of the current state first. Never reset, recreate or restart Supabase.

## First owner / invite links

People are invited from Settings → Users in the app. The very first owner link
is minted by `scripts/create-owner.ts`, which forces role `owner`: use it only
for owners. The box has no Node, so run it in a throwaway container:

```bash
cd /DATA/AppData/dentec-erp && tar czf - -C src . | docker run --rm -i \
  --network supabase_default --env-file .env.app -e APP_URL=https://erp.dentec.cloud \
  node:22-bookworm-slim sh -c 'mkdir /app && tar xzf - -C /app && cd /app \
  && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --silent >/dev/null 2>&1 \
  && npx tsx scripts/create-owner.ts --email someone@example.com'
```

## Configuration

| Variable | Where | Meaning |
|---|---|---|
| `DATABASE_URL` | `.env.app` | `dentec_app` role, host `db` on Supabase's network |
| `APP_URL` | `deploy.sh` | public origin used in invite/reset links |
| `INTERNAL_ORIGIN` | image | `http://localhost:3000`, the PDF renderer's loopback |
| `CHROMIUM_PATH` | image | `/usr/bin/chromium` |
| `SMTP_*`, `MAIL_FROM` | `.env.app` (optional) | without them, links are shown in the app instead of emailed |
| `CLOUDFLARE_TUNNEL_TOKEN` | `.env.tunnel` | read by `deploy.sh`, handed to cloudflared as `TUNNEL_TOKEN` |
