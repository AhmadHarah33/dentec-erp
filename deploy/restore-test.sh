#!/bin/sh
# Prove a backup restores: load the newest dump into a scratch database, count
# the rows of every erp table in both places, and compare. The scratch database
# is created and dropped by this script; the live database is only read.
#
#   sh restore-test.sh [path/to/erp-YYYYMMDD-HHMMSS.dump]
#
# (A mismatch is expected if the data changed after the dump: run backup.sh first.)
# Exit 0 and "restore verified" mean every table has the same row count live
# and restored. Anything else exits non-zero and leaves the scratch database in
# place for inspection (drop it with: DROP DATABASE dentec_restore_test).

set -eu

DIR="${BACKUP_DIR:-/DATA/AppData/dentec-erp/backups}"
CONTAINER="${DB_CONTAINER:-supabase-db}"
SCRATCH="dentec_restore_test"
DUMP="${1:-$(ls -t "$DIR"/erp-*.dump | head -1)}"

psql_in() { docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -At "$@"; }

COUNTS="select table_name || '=' || (xpath('/row/c/text()',
  query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
  from information_schema.tables where table_schema = 'erp' and table_type = 'BASE TABLE' order by table_name"

echo "restoring $DUMP into $SCRATCH"
# A scratch copy left by an earlier failed run. Only ever this one name.
psql_in -c "drop database if exists $SCRATCH" > /dev/null
psql_in -c "create database $SCRATCH" > /dev/null
# --no-owner / --no-privileges: the scratch copy needs the data, not the grants.
docker exec -i "$CONTAINER" pg_restore -U postgres -d "$SCRATCH" --no-owner --no-privileges < "$DUMP"

psql_in -d postgres -c "$COUNTS" > /tmp/restore-live.txt
psql_in -d "$SCRATCH" -c "$COUNTS" > /tmp/restore-copy.txt

if [ "$(cat /tmp/restore-live.txt)" = "$(cat /tmp/restore-copy.txt)" ]; then
  echo "restore verified: $(wc -l < /tmp/restore-live.txt) tables, identical row counts"
  psql_in -c "drop database $SCRATCH" > /dev/null
  rm -f /tmp/restore-live.txt /tmp/restore-copy.txt
else
  echo "MISMATCH between the live data and the restored copy:" >&2
  echo "--- live" >&2; cat /tmp/restore-live.txt >&2
  echo "--- restored" >&2; cat /tmp/restore-copy.txt >&2
  exit 1
fi
