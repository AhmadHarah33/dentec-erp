/**
 * The showcase copy's data: no database, everything in memory.
 *
 * The demo business ships with the app as `demo-snapshot.json` (made by
 * scripts/build-demo-snapshot.ts from the seeded demo data). On first use it is
 * loaded into memory with every date moved forward by the number of days since
 * the snapshot was taken, so "this month", "overdue" and the sales trend always
 * look current instead of aging.
 *
 * Changes a visitor makes live in this server instance only. A new instance
 * (a cold start, or another serverless worker) starts again from the snapshot,
 * which is what a showcase wants: nothing a visitor does can break it for the
 * next person.
 *
 * Same contract as the Postgres store — a read gives a snapshot, a write runs
 * against a private copy and replaces the collections it touched — so none of
 * the server actions know the difference. State is on `globalThis` for the
 * reason documented in store.ts.
 */

import { addDays, daysBetween, today } from "@/lib/dates";
import { lazyDraft } from "./draft";
import type { Database } from "./types";

interface DemoState {
  db: Database | null;
  loading: Promise<Database> | null;
  /** Writes run one at a time, like the advisory lock in the real store. */
  queue: Promise<unknown>;
}

const KEY = Symbol.for("dentec.demo-store");
const holder = globalThis as unknown as Record<symbol, DemoState | undefined>;
const state: DemoState = (holder[KEY] ??= { db: null, loading: null, queue: Promise.resolve() });

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Move every date and timestamp in a value forward by `days`, leaving everything else alone. */
function shift(value: unknown, days: number): unknown {
  if (typeof value === "string") {
    if (DATE.test(value)) return addDays(value, days);
    if (TIMESTAMP.test(value)) return new Date(Date.parse(value) + days * 86_400_000).toISOString();
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => shift(v, days));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shift(v, days)]));
  }
  return value;
}

async function load(): Promise<Database> {
  const file = (await import("./demo-snapshot.json")).default as unknown as { takenOn: string; database: Database };
  const days = Math.max(0, daysBetween(file.takenOn, today()));
  return shift(file.database, days) as Database;
}

export async function demoGetDb(): Promise<Database> {
  if (state.db) return state.db;
  state.loading ??= load().then((db) => {
    state.db = db;
    return db;
  });
  return state.loading;
}

export async function demoMutate<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  const run = state.queue.then(async () => {
    const current = await demoGetDb();
    const { draft, touched } = lazyDraft(current);
    const result = await fn(draft);
    // A callback that threw never gets here, so nothing half-written is kept.
    const next = { ...current } as Record<string, unknown>;
    for (const name of touched()) next[name] = (draft as unknown as Record<string, unknown>)[name];
    state.db = next as unknown as Database;
    return result;
  });
  state.queue = run.catch(() => undefined);
  return run;
}
