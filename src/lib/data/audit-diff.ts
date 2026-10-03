/**
 * Work out what a mutation changed, as audit-log rows. Pure: it compares the
 * database as it was when the write lock was taken with the copy the action
 * edited, so every code path that goes through `mutate()` is covered without
 * each action having to remember to log.
 *
 * The stock ledger is not repeated here: it is already an append-only record
 * of itself, and an invoice issue would otherwise write a log row per move.
 */

import { COLLECTIONS } from "./schema-map";
import type { CollectionName, Database } from "./types";

export interface Actor {
  id: string | null;
  name: string;
  role: string;
}

export interface AuditEntry {
  collection: string;
  record_id: string;
  label: string;
  action: "insert" | "update" | "delete";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

type Row = Record<string, unknown>;

/** Bookkeeping that changes on every save and says nothing about the record. */
const IGNORED = new Set(["createdAt", "updatedAt"]);

const NOT_LOGGED: CollectionName[] = ["stockMoves"];

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function labelOf(row: Row): string {
  for (const key of ["number", "name", "nameAr", "sku", "description", "email"]) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 120);
  }
  return String(row.id ?? "");
}

function stripped(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (!IGNORED.has(k)) out[k] = v;
  return out;
}

export function diffDatabases(before: Database, after: Database): AuditEntry[] {
  const out: AuditEntry[] = [];

  const { updatedAt: _a, ...settingsBefore } = before.settings;
  const { updatedAt: _b, ...settingsAfter } = after.settings;
  const changedSettings = Object.keys(settingsAfter).filter(
    (k) => !same((settingsBefore as Row)[k], (settingsAfter as Row)[k]),
  );
  if (changedSettings.length > 0) {
    out.push({
      collection: "settings",
      record_id: "1",
      label: after.settings.companyName,
      action: "update",
      before: Object.fromEntries(changedSettings.map((k) => [k, (settingsBefore as Row)[k] ?? null])),
      after: Object.fromEntries(changedSettings.map((k) => [k, (settingsAfter as Row)[k] ?? null])),
    });
  }

  for (const name of COLLECTIONS) {
    if (NOT_LOGGED.includes(name)) continue;
    const was = new Map((before[name] as unknown as Row[]).map((r) => [r.id as string, r]));
    for (const row of after[name] as unknown as Row[]) {
      const id = row.id as string;
      const old = was.get(id);
      was.delete(id);
      if (!old) {
        out.push({ collection: name, record_id: id, label: labelOf(row), action: "insert", before: null, after: stripped(row) });
        continue;
      }
      const keys = Object.keys(row).filter((k) => !IGNORED.has(k) && !same(old[k], row[k]));
      if (keys.length === 0) continue;
      out.push({
        collection: name,
        record_id: id,
        label: labelOf(row),
        action: "update",
        before: Object.fromEntries(keys.map((k) => [k, old[k] ?? null])),
        after: Object.fromEntries(keys.map((k) => [k, row[k] ?? null])),
      });
    }
    for (const [id, old] of was) {
      out.push({ collection: name, record_id: id, label: labelOf(old), action: "delete", before: stripped(old), after: null });
    }
  }
  return out;
}
