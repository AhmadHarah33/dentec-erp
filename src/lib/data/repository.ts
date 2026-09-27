/**
 * The seam between the app and its storage.
 *
 * Pages and Server Actions import from here and nowhere deeper. Two stores sit
 * behind it with the same contract:
 *
 * - `store-supabase.ts` when SUPABASE_URL and the anon key are set — real,
 *   multi-user data under row-level security;
 * - `store.ts` otherwise — the JSON demo file, seeded with sample data.
 *
 * No page needs to know which one answered.
 */

import * as jsonStore from "./store";
import * as supabaseStore from "./store-supabase";
import { isSupabaseEnabled } from "../supabase/config";
import type {
  Base,
  CollectionName,
  Database,
  ID,
  Settings,
} from "./types";

/** The element type of a collection. */
type Row<K extends CollectionName> = Database[K][number];

/** What a caller supplies when creating a row: everything but the bookkeeping. */
export type NewRow<K extends CollectionName> = Omit<
  Row<K>,
  "id" | "createdAt" | "updatedAt"
> &
  Partial<Base>;

function store() {
  return isSupabaseEnabled() ? supabaseStore : jsonStore;
}

const getDb = () => store().getDb();
const mutate = <T,>(fn: (db: Database) => T | Promise<T>) => store().mutate(fn);

function now(): string {
  return new Date().toISOString();
}

function newId(): ID {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : "id_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export async function list<K extends CollectionName>(name: K): Promise<Row<K>[]> {
  const db = await getDb();
  return db[name] as Row<K>[];
}

export async function find<K extends CollectionName>(
  name: K,
  id: ID | null | undefined,
): Promise<Row<K> | undefined> {
  if (!id) return undefined;
  const rows = await list(name);
  return rows.find((r) => (r as Base).id === id);
}

/** One shot at the whole database, for pages that cross several collections. */
export async function snapshot(): Promise<Database> {
  return getDb();
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export async function create<K extends CollectionName>(
  name: K,
  data: NewRow<K>,
): Promise<Row<K>> {
  return mutate((db) => {
    const ts = now();
    const row = {
      ...(data as object),
      id: (data as Partial<Base>).id ?? newId(),
      createdAt: (data as Partial<Base>).createdAt ?? ts,
      updatedAt: ts,
    } as Row<K>;
    (db[name] as Row<K>[]).push(row);
    return row;
  });
}

export async function update<K extends CollectionName>(
  name: K,
  id: ID,
  patch: Partial<Row<K>>,
): Promise<Row<K>> {
  return mutate((db) => {
    const rows = db[name] as Row<K>[];
    const index = rows.findIndex((r) => (r as Base).id === id);
    if (index === -1) throw new Error(`${name}: no row with id ${id}`);
    const merged = { ...rows[index], ...patch, updatedAt: now() } as Row<K>;
    rows[index] = merged;
    return merged;
  });
}

export async function remove<K extends CollectionName>(
  name: K,
  id: ID,
): Promise<void> {
  return mutate((db) => {
    const rows = db[name] as Row<K>[];
    const index = rows.findIndex((r) => (r as Base).id === id);
    if (index !== -1) rows.splice(index, 1);
  });
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  return mutate((db) => {
    db.settings = { ...db.settings, ...patch, updatedAt: now() };
    return db.settings;
  });
}

/**
 * Run several writes as one unit. Used wherever a document and its stock
 * moves must land together — issuing an invoice, receiving a purchase order.
 */
export async function transaction<T>(
  fn: (db: Database, helpers: { id: () => ID; now: () => string }) => T,
): Promise<T> {
  return mutate((db) => fn(db, { id: newId, now }));
}

/** Throw the data away and lay the demo set down again. Demo mode only. */
export async function resetDb(): Promise<void> {
  return store().resetDb();
}

export { dataDir } from "./store";
export { PermissionError } from "./store-supabase";
