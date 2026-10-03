"use server";

import { revalidatePath } from "next/cache";
import { snapshot, transaction } from "@/lib/data/repository";
import { guard } from "@/lib/auth/server";
import { today } from "@/lib/dates";
import { IMPORT_KINDS, MAX_IMPORT_ROWS, type ImportKind } from "@/lib/import/kinds";
import { planImport, type RowResult } from "@/lib/import/plan";
import { fail, ok, STOCK_PATHS, type Result } from "./shared";

type Records = Record<string, string>[];

export interface ImportPreview {
  ok: boolean;
  /** Rows that would be written. */
  count: number;
  results: RowResult[];
}

/** The browser sends parsed rows; trust nothing about their shape. */
function clean(kind: string, records: unknown): { kind: ImportKind; records: Records } | null {
  if (!IMPORT_KINDS.includes(kind as ImportKind)) return null;
  if (!Array.isArray(records) || records.length === 0 || records.length > MAX_IMPORT_ROWS) return null;
  const out: Records = [];
  for (const r of records) {
    if (!r || typeof r !== "object") return null;
    const rec: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) rec[k] = typeof v === "string" ? v.trim().slice(0, 500) : "";
    out.push(rec);
  }
  return { kind: kind as ImportKind, records: out };
}

/** Check a file's rows without writing anything. */
export async function previewImport(kind: string, records: unknown): Promise<Result<ImportPreview>> {
  const gate = await guard("settings", "edit");
  if (!gate.ok) return gate;
  const input = clean(kind, records);
  if (!input) return fail("import.badFile");

  const plan = planImport(input.kind, input.records, await snapshot(), today());
  return ok({ ok: plan.ok, count: plan.count, results: plan.results });
}

/**
 * Write a file's rows, all or nothing. The rows are checked again here, under
 * the write lock, against the data as it is now: the preview may be minutes
 * old and someone may have added the same SKU since.
 */
export async function runImport(kind: string, records: unknown): Promise<Result<{ count: number }>> {
  const gate = await guard("settings", "edit");
  if (!gate.ok) return gate;
  const input = clean(kind, records);
  if (!input) return fail("import.badFile");

  const outcome = await transaction((db, h) => {
    const plan = planImport(input.kind, input.records, db, today());
    if (!plan.ok) return null;
    plan.apply(db, h);
    return plan.count;
  });
  if (outcome === null) return fail("import.changed");

  for (const p of [...STOCK_PATHS, "/customers", "/suppliers", "/products", "/spare-parts", "/settings/activity"]) {
    revalidatePath(p);
  }
  return ok({ count: outcome });
}
