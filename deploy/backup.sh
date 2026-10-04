#!/bin/sh
# Nightly backup of the ERP's data: the `erp` schema of the Supabase Postgres
# container, nothing else. The owner's other tables and Supabase's own schemas
# are not this script's to copy or touch.
#
# Run by cron on the ZimaOS box as the deploy user (install: see DEPLOY.md):
#   30 2 * * * /DATA/AppData/dentec-erp/backup.sh
#
# A custom-format dump (-Fc) is compressed and restores selectively with
# pg_restore. It is written to a temporary name, checked to be a readable
# archive, and only then renamed, so a failed night never leaves a file that
# looks like a backup but is not. Dumps older than KEEP_DAYS are removed; only
# files named erp-*.dump in this folder, never anything else.

set -eu

DIR="${BACKUP_DIR:-/DATA/AppData/dentec-erp/backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
CONTAINER="${DB_CONTAINER:-supabase-db}"

umask 077
mkdir -p "$DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$DIR/erp-$STAMP.dump"

docker exec "$CONTAINER" pg_dump -U postgres -Fc -n erp postgres > "$OUT.tmp"
docker exec -i "$CONTAINER" pg_restore -l < "$OUT.tmp" > /dev/null
mv "$OUT.tmp" "$OUT"

find "$DIR" -maxdepth 1 -name 'erp-*.dump' -mtime +"$KEEP_DAYS" -delete

echo "$(date -Iseconds) wrote $OUT ($(wc -c < "$OUT") bytes)" >> "$DIR/backup.log"
