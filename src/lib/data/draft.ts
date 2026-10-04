/**
 * Shared by the Postgres store and the in-memory demo store.
 */

import type { Database } from "./types";

/**
 * A draft of the database that copies a collection the first time it is read.
 *
 * Cloning the whole database for every write meant a payment copied the
 * entire stock ledger. Now an action pays only for what it touches: reading
 * `db.payments` clones payments, and the collections it never mentions stay
 * the same objects as in the snapshot. `touched()` says which were copied, so
 * the write and the audit diff skip the rest.
 */
export function lazyDraft(fresh: Database): { draft: Database; touched: () => Set<string> } {
  const copies = new Map<string, unknown>();
  const draft = {} as Database;
  for (const key of Object.keys(fresh) as (keyof Database)[]) {
    Object.defineProperty(draft, key, {
      enumerable: true,
      get() {
        if (!copies.has(key)) copies.set(key, structuredClone(fresh[key]));
        return copies.get(key);
      },
      set(value) {
        copies.set(key, value);
      },
    });
  }
  return { draft, touched: () => new Set(copies.keys()) };
}
