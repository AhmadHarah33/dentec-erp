/**
 * Server-side persistence. NEVER import this from a client component.
 *
 * The whole database lives in one JSON file, loaded into memory once and
 * written back atomically (temp file + rename) behind a serialized queue.
 *
 * One file rather than one-per-collection, deliberately: issuing an invoice
 * writes both `salesInvoices` and `stockMoves`, and those two must land
 * together or not at all. A single file makes that atomic for free.
 *
 * Everything above this module talks to `repository.ts`. When Supabase
 * arrives, this file is the only thing that gets replaced.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Database } from "./types";
import { buildSeed } from "./seed";

const DATA_DIR = process.env.DENTEC_DATA_DIR
  ? path.resolve(process.env.DENTEC_DATA_DIR)
  : path.resolve(process.cwd(), "data");

const DB_FILE = path.join(DATA_DIR, "dentec.json");

/**
 * State lives on globalThis rather than in module scope.
 *
 * Next.js bundles server components and server actions separately, so a
 * module-level `let` is instantiated once per bundle. That gave us two
 * independent caches: an action would mutate its own copy and write it to
 * disk, while the page kept rendering from a stale one — the invoice you just
 * issued still showing as a draft. A single global keeps every bundle, and
 * every dev-server hot reload, pointed at the same object.
 */
interface StoreState {
  /** In-memory copy. Loaded once, kept in sync with disk on every write. */
  cache: Database | null;
  /**
   * The in-flight load. Without this, two requests arriving together on a cold
   * start would each seed the database and race to rename their temp file.
   */
  loading: Promise<Database> | null;
  /**
   * Serialized write queue. Every mutation chains onto the previous one, so two
   * concurrent requests can never interleave a read-modify-write and lose data.
   */
  queue: Promise<unknown>;
}

const STORE_KEY = Symbol.for("dentec.store");

const globalStore = globalThis as unknown as Record<symbol, StoreState | undefined>;

const state: StoreState = (globalStore[STORE_KEY] ??= {
  cache: null,
  loading: null,
  queue: Promise.resolve(),
});

async function readFromDisk(): Promise<Database> {
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    return JSON.parse(raw) as Database;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      // First run — lay down the seed so the app is never staring at nothing.
      // writeToDisk swallows a read-only filesystem, so a serverless cold
      // start seeds into memory instead of throwing on every page.
      const seed = buildSeed();
      await writeToDisk(seed);
      return seed;
    }

    /*
     * Anything else — a corrupt file, a permission code this host spells
     * differently, a directory where a file should be — falls back to the
     * seed rather than taking every page down with it.
     *
     * An unreadable store is a broken demo; a store that throws is a white
     * screen on every route. The cause is logged in full, because silently
     * serving the seed when someone's real data failed to load would be the
     * worse failure of the two.
     */
    readOnlyFs = true;
    console.error(
      `[dentec] could not read ${DB_FILE} (${code ?? "unknown"}) — ` +
        "serving a seeded in-memory database. Changes will not persist.",
      err,
    );
    return buildSeed();
  }
}

/**
 * True once a write has failed because the filesystem is read-only.
 *
 * A serverless host (Vercel, and anything else that ships the app as an
 * immutable bundle) allows writes only under /tmp. There the in-memory cache
 * IS the database: it is seeded on cold start, it accepts every mutation, and
 * it is discarded when the instance recycles. That is a demo, not storage —
 * which is exactly what a preview deployment is for, and exactly why real
 * persistence is waiting on Supabase rather than on this file.
 *
 * The flag exists so one EROFS is reported once and not on every keystroke.
 */
let readOnlyFs = false;

/** Errors that mean "this disk will never accept a write", not "try again". */
function isReadOnly(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === "EROFS" || code === "EACCES" || code === "EPERM";
}

async function writeToDisk(db: Database): Promise<void> {
  if (readOnlyFs) return;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    // A unique temp name so two writers can never collide on it.
    const tmp = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
    // rename is atomic on the same volume: a crash leaves either the old file
    // or the new one, never a half-written one.
    await fs.rename(tmp, DB_FILE);
  } catch (err: unknown) {
    if (!isReadOnly(err)) throw err;
    readOnlyFs = true;
    console.warn(
      `[dentec] ${DATA_DIR} is read-only — running from memory. ` +
        "Changes will be lost when this instance recycles.",
    );
  }
}

/** Read-only snapshot of the database. */
export async function getDb(): Promise<Database> {
  if (state.cache) return state.cache;
  if (!state.loading) {
    state.loading = readFromDisk().then(
      (db) => {
        state.cache = db;
        return db;
      },
      (err) => {
        // Never cache a rejection: a single bad read would otherwise poison
        // every later request on this instance.
        state.loading = null;
        throw err;
      },
    );
  }
  return state.loading;
}

/**
 * Apply a mutation and persist it. The callback receives the live database
 * and may modify it in place; whatever it returns is returned to the caller.
 *
 * Mutations are queued, so the callback always sees the result of every
 * mutation that came before it.
 */
export async function mutate<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  const run = state.queue.then(async () => {
    const db = await getDb();
    const result = await fn(db);
    await writeToDisk(db);
    return result;
  });
  // Keep the chain alive even if this mutation throws, so one failure does not
  // wedge every later write.
  state.queue = run.catch(() => undefined);
  return run;
}

/** Drop the seeded database and start over. Used by Settings → reset. */
export async function resetDb(): Promise<void> {
  await state.queue.catch(() => undefined);
  state.cache = buildSeed();
  state.loading = Promise.resolve(state.cache);
  await writeToDisk(state.cache);
}

export const dataDir = DATA_DIR;
