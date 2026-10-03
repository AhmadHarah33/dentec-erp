/**
 * Server-side persistence on Postgres (self-hosted Supabase). NEVER import
 * this from a client component.
 *
 * The rest of the app still sees one `Database` object: `getDb()` hands out a
 * snapshot and `mutate(fn)` lets a callback change a copy of it, then writes
 * the difference back in one transaction. That contract is why none of the
 * server actions had to change when the JSON file was retired.
 *
 * Reads: every table carries a version counter (`erp.table_versions`, bumped
 * by a statement trigger). A read asks for the counters — one small query —
 * and reloads only the tables that moved. Two app instances therefore never
 * serve each other stale data, and an unchanged page view costs one query.
 *
 * Writes: a transaction-scoped advisory lock serialises them, the database is
 * re-read inside the lock, the callback runs against a deep copy, and only
 * the rows that differ are written. A callback that throws leaves nothing
 * behind — not in Postgres, and not in the cache, which the old in-place JSON
 * mutation could corrupt. Foreign keys are deferred to commit, so write order
 * inside one mutation never matters.
 */

import postgres from "postgres";
import { COLLECTIONS, SPECS, snake, tablesOf, type ChildSpec, type TableSpec } from "./schema-map";
import type { CollectionName, Database, Settings } from "./types";

type Sql = postgres.Sql<Record<string, unknown>>;
type Tx = postgres.TransactionSql<Record<string, unknown>>;
type Query = Sql | Tx;
type Row = Record<string, unknown>;

/** Any 64-bit constant works; it only has to be the same for every writer. */
const WRITE_LOCK = 4_242_001;

/* ------------------------------------------------------------------ */
/* Connection                                                          */
/* ------------------------------------------------------------------ */

/** "2026-10-03 17:48:03.12+00" → "2026-10-03T17:48:03.120Z" */
function isoTimestamp(text: string): string {
  return new Date(text.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString();
}

function connect(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "[dentec] DATABASE_URL is not set. Point it at the erp database, e.g. " +
        "postgres://dentec_app:<password>@<host>:5432/postgres",
    );
  }
  return postgres(url, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    // Supavisor in transaction mode cannot hold prepared statements.
    prepare: false,
    idle_timeout: 30,
    connection: { application_name: "dentec-erp" },
    onnotice: () => {},
    types: {
      // numeric → JS number. Values here are money, quantities and rates the
      // app itself computed as numbers, so nothing is lost on the way back.
      numeric: {
        to: 1700,
        from: [1700],
        serialize: (x: unknown) => String(x),
        parse: (x: string) => Number(x),
      },
      bigint: { to: 20, from: [20], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
      // Dates stay "YYYY-MM-DD" strings, exactly as types.ts declares them.
      date: { to: 1082, from: [1082], serialize: (x: unknown) => String(x), parse: (x: string) => x },
      timestamp: {
        to: 1184,
        from: [1184, 1114],
        serialize: (x: unknown) => String(x),
        parse: isoTimestamp,
      },
    },
  }) as unknown as Sql;
}

/* ------------------------------------------------------------------ */
/* State — on globalThis, for the reason the JSON store documented:    */
/* Next bundles server components and server actions separately, and   */
/* a module-level cache would exist once per bundle.                   */
/* ------------------------------------------------------------------ */

interface StoreState {
  sql: Sql | null;
  cache: Database | null;
  versions: Map<string, number>;
  loading: Promise<Database> | null;
}

const STORE_KEY = Symbol.for("dentec.pg-store");
const globalStore = globalThis as unknown as Record<symbol, StoreState | undefined>;
const state: StoreState = (globalStore[STORE_KEY] ??= {
  sql: null,
  cache: null,
  versions: new Map(),
  loading: null,
});

function sql(): Sql {
  return (state.sql ??= connect());
}

/* ------------------------------------------------------------------ */
/* Row mapping                                                         */
/* ------------------------------------------------------------------ */

function fromRow(spec: { fields: string[]; optional?: string[] }, row: Row): Row {
  const out: Row = {};
  for (const field of spec.fields) {
    const value = row[snake(field)];
    if (value === null && spec.optional?.includes(field)) continue;
    out[field] = value;
  }
  return out;
}

function toRow(q: Query, spec: { fields: string[]; json?: string[] }, obj: Row): Row {
  const out: Row = {};
  for (const field of spec.fields) {
    const value = obj[field];
    const column = snake(field);
    if (value === undefined || value === null) out[column] = null;
    else if (spec.json?.includes(field)) out[column] = q.json(value as postgres.JSONValue);
    else if (Array.isArray(value)) out[column] = q.array(value as string[], 25);
    else out[column] = value;
  }
  return out;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

async function readVersions(q: Query): Promise<Map<string, number>> {
  const rows = await q`select table_name, version from erp.table_versions`;
  return new Map(rows.map((r) => [r.table_name as string, r.version as number]));
}

async function loadCollection(q: Query, spec: TableSpec): Promise<Row[]> {
  const rows = await q`select * from ${q("erp." + spec.table)} order by created_at, id`;
  const records = rows.map((r) => fromRow(spec, r));
  if (!spec.children) return records;

  const child = spec.children;
  const childRows = await q`
    select * from ${q("erp." + child.table)} order by ${q(child.parentKey)}, position`;
  const byParent = new Map<string, Row[]>();
  for (const r of childRows) {
    const key = r[child.parentKey] as string;
    let list = byParent.get(key);
    if (!list) byParent.set(key, (list = []));
    list.push(fromRow(child, r));
  }
  for (const record of records) record[child.prop] = byParent.get(record.id as string) ?? [];
  return records;
}

async function loadSettings(q: Query): Promise<Settings> {
  const [row] = await q`select data, updated_at from erp.settings where id = 1`;
  if (!row) throw new Error("[dentec] erp.settings is empty — the schema migration has not run.");
  return { ...(row.data as Settings), updatedAt: row.updated_at as string };
}

/**
 * Bring a cached database up to date with what is committed. Collections
 * whose tables have not moved are carried over by reference; the result is
 * a new top-level object, so a reader holding the previous snapshot keeps a
 * consistent view.
 */
async function refresh(
  q: Query,
  cache: Database | null,
  known: Map<string, number>,
): Promise<{ db: Database; versions: Map<string, number> }> {
  const versions = await readVersions(q);
  const moved = (table: string) => !cache || versions.get(table) !== known.get(table);

  const db = { ...(cache ?? {}) } as Database;
  if (moved("settings")) db.settings = await loadSettings(q);
  for (const name of COLLECTIONS) {
    const spec = SPECS[name];
    if (tablesOf(spec).some(moved)) {
      (db as unknown as Record<CollectionName, Row[]>)[name] = await loadCollection(q, spec);
    }
  }
  return { db, versions };
}

/** Read-only snapshot of the database. Do not mutate what this returns. */
export async function getDb(): Promise<Database> {
  // Concurrent requests share one in-flight refresh rather than each running
  // their own.
  if (state.loading) return state.loading;
  state.loading = sql()
    .begin("isolation level repeatable read read only", (tx) =>
      refresh(tx, state.cache, state.versions),
    )
    .then(
      ({ db, versions }) => {
        state.cache = db;
        state.versions = versions;
        state.loading = null;
        return db;
      },
      (err) => {
        // Never cache a rejection: one failed read must not poison the rest.
        state.loading = null;
        throw err;
      },
    );
  return state.loading;
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

async function writeChildren(tx: Tx, child: ChildSpec, parentId: string, list: Row[]) {
  if (list.length === 0) return;
  const rows = list.map((item, position) => ({
    ...toRow(tx, child, item),
    [child.parentKey]: parentId,
    position,
  }));
  await tx`insert into ${tx("erp." + child.table)} ${tx(rows)}`;
}

async function writeCollection(tx: Tx, spec: TableSpec, before: Row[], after: Row[]) {
  const table = tx("erp." + spec.table);
  const previous = new Map(before.map((r) => [r.id as string, r]));
  const child = spec.children;

  for (const row of after) {
    const id = row.id as string;
    const old = previous.get(id);
    previous.delete(id);

    if (!old) {
      await tx`insert into ${table} ${tx(toRow(tx, spec, row))}`;
      if (child) await writeChildren(tx, child, id, (row[child.prop] as Row[]) ?? []);
      continue;
    }

    if (spec.fields.some((f) => !same(old[f], row[f]))) {
      const { id: _id, ...patch } = toRow(tx, spec, row);
      await tx`update ${table} set ${tx(patch)} where id = ${id}`;
    }
    if (child && !same(old[child.prop], row[child.prop])) {
      await tx`delete from ${tx("erp." + child.table)} where ${tx(child.parentKey)} = ${id}`;
      await writeChildren(tx, child, id, (row[child.prop] as Row[]) ?? []);
    }
  }

  const removed = [...previous.keys()];
  if (removed.length > 0) await tx`delete from ${table} where id in ${tx(removed)}`;
}

/**
 * Apply a mutation and persist it. The callback receives a private copy of
 * the database and may modify it in place; whatever it returns is returned
 * to the caller once the transaction has committed.
 */
export async function mutate<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  const { result, fresh, versions } = await sql().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${WRITE_LOCK})`;
    const { db: fresh, versions } = await refresh(tx, state.cache, state.versions);
    const draft = structuredClone(fresh);
    const result = await fn(draft);

    if (!same({ ...fresh.settings, updatedAt: null }, { ...draft.settings, updatedAt: null })) {
      const { updatedAt: _u, ...data } = draft.settings;
      await tx`update erp.settings set data = ${tx.json(data as postgres.JSONValue)}, updated_at = now() where id = 1`;
    }
    for (const name of COLLECTIONS) {
      await writeCollection(
        tx,
        SPECS[name],
        fresh[name] as unknown as Row[],
        draft[name] as unknown as Row[],
      );
    }
    return { result, fresh, versions };
  });

  // Keep what was read inside the lock, at the versions it was read at. The
  // write bumped those versions, so the next read reloads exactly the tables
  // this mutation touched — including any a foreign-key action changed.
  if (!state.loading) {
    state.cache = fresh;
    state.versions = versions;
  }
  return result;
}

/**
 * The raw connection, for the auth module's credentials, sessions and
 * one-time tokens — tables that are deliberately not part of the cached
 * Database (see migration 0002). Nothing else should need this.
 */
export function database(): Sql {
  return sql();
}

/** Where the data lives, for the settings page. Never includes the password. */
export function databaseLabel(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return "—";
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "—";
  }
}

/**
 * Close the pool — for scripts and tests, never for the running app.
 * `keepCache` keeps what was read, to stand in for a long-lived instance
 * whose cache must notice writes made elsewhere.
 */
export async function closeDb(opts: { keepCache?: boolean } = {}): Promise<void> {
  await state.sql?.end({ timeout: 5 });
  state.sql = null;
  state.loading = null;
  if (!opts.keepCache) {
    state.cache = null;
    state.versions = new Map();
  }
}
