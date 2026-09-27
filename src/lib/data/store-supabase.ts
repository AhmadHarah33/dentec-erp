/**
 * Server-side persistence against Supabase (Postgres). NEVER import this from
 * a client component.
 *
 * It keeps the exact contract of the JSON store (`store.ts`): `getDb()` hands
 * back a whole `Database`, and `mutate(fn)` lets a callback edit it in place.
 * Every server action was written against that contract, so none of them
 * changes when the storage does.
 *
 * How a write works:
 *
 *   1. Load a fresh snapshot through `get_snapshot()` — one round trip, and
 *      row-level security decides which rows this user can see.
 *   2. Run the callback on a deep copy.
 *   3. Diff the copy against the snapshot: rows inserted, updated, deleted.
 *   4. Send the diff to `apply_changes()`, which applies it in ONE Postgres
 *      transaction, but only if the database version is still the one the
 *      snapshot was taken at.
 *   5. If another user wrote in between, the version has moved: reload and
 *      run the callback again, so it decides on current data — the next
 *      invoice number, the stock actually on hand.
 *
 * That is optimistic concurrency with a single version counter. It serialises
 * writers, which is the right trade for a team of a few people: no lost
 * update, no duplicate document number, no stock issued twice, and no locking
 * logic spread through the actions.
 */

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollectionName, Database, Settings } from "./types";
import { blankSettings } from "./defaults";
import { createUserClient } from "../supabase/server";

/* ------------------------------------------------------------------ */
/* Mapping                                                             */
/* ------------------------------------------------------------------ */

/** Collection name → table name. Everything not listed maps to snake_case. */
const TABLE: Record<CollectionName, string> = {
  users: "profiles",
  categories: "categories",
  items: "items",
  warehouses: "warehouses",
  stockMoves: "stock_moves",
  customers: "customers",
  suppliers: "suppliers",
  salesInvoices: "sales_invoices",
  purchaseOrders: "purchase_orders",
  payments: "payments",
  expenses: "expenses",
  serviceJobs: "service_jobs",
};

const COLLECTIONS = Object.keys(TABLE) as CollectionName[];

/**
 * Fields the TypeScript types mark optional (`field?:`). A NULL column for
 * one of these comes back as a missing key, which is what the rest of the app
 * was written to expect; required-but-nullable fields stay null.
 */
const OPTIONAL: Partial<Record<CollectionName, string[]>> = {
  users: ["mustChangePassword", "tourCompletedAt"],
  customers: ["billingRegion", "turkey", "syria"],
  suppliers: ["billingRegion", "turkey", "syria"],
  salesInvoices: ["billingRegion", "documentType", "dispatch", "localRate", "localCurrency"],
  purchaseOrders: ["serviceJobId"],
  serviceJobs: ["invoiceId"],
};

/** Date and timestamp columns: an empty string would be rejected by Postgres. */
const TEMPORAL = new Set([
  "date",
  "due_date",
  "expected_date",
  "issued_at",
  "received_at",
  "closed_at",
  "tour_completed_at",
  "created_at",
  "updated_at",
]);

const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const toCamel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Top-level keys only: nested JSON (lines, parts, tax profiles) is stored as written. */
function fromRow(collection: CollectionName, row: Record<string, unknown>): Record<string, unknown> {
  const optional = OPTIONAL[collection] ?? [];
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camel = toCamel(key);
    if (value === null && optional.includes(camel)) continue;
    out[camel] = value;
  }
  return out;
}

function toRow(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    const snake = toSnake(key);
    out[snake] = TEMPORAL.has(snake) && value === "" ? null : value;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

interface Loaded {
  version: number;
  db: Database;
}

interface RawSnapshot {
  version: number;
  settings: Partial<Settings> | null;
  [table: string]: unknown;
}

async function load(client: SupabaseClient): Promise<Loaded> {
  const { data, error } = await client.rpc("get_snapshot");
  if (error) throw new Error(`[dentec] get_snapshot failed: ${error.message}`);
  const raw = data as RawSnapshot;

  const db = { settings: { ...blankSettings(), ...(raw.settings ?? {}) } } as Database;
  for (const collection of COLLECTIONS) {
    const rows = (raw[TABLE[collection]] as Record<string, unknown>[] | null) ?? [];
    (db as unknown as Record<string, unknown>)[collection] = rows.map((r) => fromRow(collection, r));
  }
  return { version: Number(raw.version) || 0, db };
}

/**
 * One snapshot per request. A page renders its layout, the page and a few
 * helpers, all of which call `snapshot()`; they share a single round trip.
 * `cache` is request-scoped, so nothing leaks between users.
 */
const requestState = cache(() => ({ pending: null as Promise<Loaded> | null }));

export async function getDb(): Promise<Database> {
  const state = requestState();
  if (!state.pending) {
    state.pending = createUserClient().then(load);
    // A failed read must not be remembered for the rest of the request.
    state.pending.catch(() => {
      state.pending = null;
    });
  }
  return (await state.pending).db;
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

interface TableChanges {
  insert: Record<string, unknown>[];
  update: Record<string, unknown>[];
  delete: string[];
}

type ChangeSet = { settings?: Omit<Settings, "updatedAt"> } & Record<string, TableChanges | unknown>;

function diff(before: Database, after: Database): { changes: ChangeSet; empty: boolean } {
  const changes: ChangeSet = {};
  let empty = true;

  for (const collection of COLLECTIONS) {
    const prev = new Map(
      (before[collection] as { id: string }[]).map((r) => [r.id, JSON.stringify(r)]),
    );
    const next = after[collection] as { id: string }[];
    const set: TableChanges = { insert: [], update: [], delete: [] };
    const seen = new Set<string>();

    for (const row of next) {
      seen.add(row.id);
      const old = prev.get(row.id);
      if (old === undefined) set.insert.push(toRow(row as unknown as Record<string, unknown>));
      else if (old !== JSON.stringify(row)) set.update.push(toRow(row as unknown as Record<string, unknown>));
    }
    for (const id of prev.keys()) if (!seen.has(id)) set.delete.push(id);

    if (set.insert.length || set.update.length || set.delete.length) {
      changes[TABLE[collection]] = set;
      empty = false;
    }
  }

  if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) {
    const { updatedAt: _ignored, ...settings } = after.settings;
    changes.settings = settings;
    empty = false;
  }

  return { changes, empty };
}

/** Raised by `apply_changes` when the snapshot is stale. Retried, never shown. */
function isConflict(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "40001" ||
    error.code === "23505" || // a unique document number taken in the meantime
    Boolean(error.message?.includes("dentec_conflict"))
  );
}

export class PermissionError extends Error {
  constructor(message = "dentec_forbidden") {
    super(message);
    this.name = "PermissionError";
  }
}

const MAX_ATTEMPTS = 5;

export async function mutate<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  const client = await createUserClient();
  const state = requestState();

  for (let attempt = 1; ; attempt++) {
    const loaded = await load(client);
    const working = structuredClone(loaded.db);
    const result = await fn(working);
    const { changes, empty } = diff(loaded.db, working);

    if (empty) {
      state.pending = Promise.resolve(loaded);
      return result;
    }

    const { error } = await client.rpc("apply_changes", {
      p_expected: loaded.version,
      p_changes: changes,
    });

    if (!error) {
      // The next read in this request must see the write, not the old snapshot.
      state.pending = null;
      return result;
    }
    if (isConflict(error) && attempt < MAX_ATTEMPTS) {
      // Back off a little so two writers do not collide on every retry.
      await new Promise((r) => setTimeout(r, 40 * attempt + Math.random() * 60));
      continue;
    }
    if (error.code === "42501" || error.message?.includes("dentec_forbidden")) {
      throw new PermissionError(error.message);
    }
    throw new Error(`[dentec] apply_changes failed: ${error.message}`);
  }
}

export async function resetDb(): Promise<void> {
  throw new PermissionError("Demo reset is disabled when Supabase is connected");
}
