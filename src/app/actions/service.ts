"use server";

import { revalidatePath } from "next/cache";
import { transaction } from "@/lib/data/repository";
import type { ServiceJob, ServiceStatus } from "@/lib/data/types";
import { buildStockIndex, onHand } from "@/lib/stock";
import { guard } from "@/lib/auth/server";
import { jobInput, SERVICE_STATUSES } from "@/lib/inputs";
import { oneOf, parse } from "@/lib/validate";
import { attempt, fail, ok, STOCK_PATHS, type Result } from "./shared";

type JobInput = Omit<ServiceJob, "id" | "createdAt" | "updatedAt" | "number" | "closedAt">;

function refresh(id?: string) {
  for (const p of [...STOCK_PATHS, "/service", "/customers"]) revalidatePath(p);
  if (id) revalidatePath(`/service/${id}`);
}

function nextNumber(existing: string[], prefix: string): string {
  const year = new Date().getUTCFullYear();
  const head = `${prefix}-${year}-`;
  const highest = existing
    .filter((n) => n.startsWith(head))
    .map((n) => Number.parseInt(n.slice(head.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return head + String(highest + 1).padStart(4, "0");
}

async function saveJobImpl(id: string | null, input: JobInput): Promise<Result<string>> {
  const gate = await guard("service", "edit");
  if (!gate.ok) return gate;
  const parsed = parse(() => jobInput(input));
  if (!parsed.ok) return parsed;
  const { fields, parts: incoming } = parsed.data;
  if (!fields.customerId) return fail("msg.requiredField");
  if (!fields.reportedFault.trim()) return fail("msg.requiredField");
  if (incoming.some((p) => p.qty <= 0)) return fail("msg.requiredField");

  const outcome = await transaction((db, h): Result<string> => {
    if (!db.customers.some((c) => c.id === fields.customerId)) return fail("msg.error", "unknown-reference");
    const items = new Set(db.items.map((i) => i.id));
    const warehouses = new Set(db.warehouses.map((w) => w.id));
    if (
      (fields.machineItemId && !items.has(fields.machineItemId)) ||
      (fields.technicianId && !db.users.some((u) => u.id === fields.technicianId)) ||
      incoming.some((p) => !items.has(p.itemId) || !warehouses.has(p.warehouseId))
    ) {
      return fail("msg.error", "unknown-reference");
    }

    // A job tied to a unit carries that unit's item and serial, so the two can
    // never disagree.
    let data = fields;
    if (fields.unitId) {
      const unit = db.units.find((u) => u.id === fields.unitId);
      if (!unit) return fail("msg.error", "unit-not-found");
      data = { ...fields, machineItemId: unit.itemId, serialNo: unit.serialNo };
    }

    const ts = h.now();

    if (id) {
      const row = db.serviceJobs.find((j) => j.id === id);
      if (!row) return fail("msg.error", "not-found");

      // Parts already taken from stock are frozen; only unconsumed ones may
      // change. `consumed` is never read from the browser — it is true exactly
      // for parts the ledger has a move for.
      const consumed = new Map(row.parts.filter((p) => p.consumed).map((p) => [p.id, p]));
      for (const c of consumed.values()) {
        if (!incoming.some((p) => p.id === c.id && p.qty === c.qty && p.itemId === c.itemId)) {
          return fail("msg.error", "consumed-parts-locked");
        }
      }
      Object.assign(row, data, {
        parts: incoming.map((p) => {
          const frozen = consumed.get(p.id);
          return frozen ?? { ...p, consumed: false };
        }),
        updatedAt: ts,
      });
      return ok(row.id);
    }

    const row: ServiceJob = {
      ...data,
      parts: incoming.map((p) => ({ ...p, consumed: false })),
      id: h.id(),
      number: nextNumber(
        db.serviceJobs.map((j) => j.number),
        db.settings.servicePrefix,
      ),
      closedAt: null,
      createdAt: ts,
      updatedAt: ts,
    };
    db.serviceJobs.push(row);
    return ok(row.id);
  });

  if (outcome.ok) refresh(outcome.data);
  return outcome;
}

/**
 * Take the listed parts out of the workshop. Only parts not already consumed
 * are moved, so pressing the button twice cannot double-deduct — and because
 * "not already consumed" is decided inside the transaction, two presses at
 * the same moment cannot both pass it either.
 */
async function consumePartsImpl(id: string): Promise<Result<number>> {
  const gate = await guard("service", "edit");
  if (!gate.ok) return gate;

  const outcome = await transaction((store, h): Result<number> => {
    const row = store.serviceJobs.find((j) => j.id === id);
    if (!row) return fail("msg.error", "not-found");

    const pending = row.parts.filter((p) => !p.consumed);
    if (pending.length === 0) return ok(0);

    const index = buildStockIndex(store.stockMoves);
    const needed = new Map<string, number>();
    for (const p of pending) {
      const key = p.itemId + "|" + p.warehouseId;
      needed.set(key, (needed.get(key) ?? 0) + p.qty);
    }
    for (const [key, qty] of needed) {
      const [itemId, warehouseId] = key.split("|");
      if (onHand(index, itemId, warehouseId) < qty) {
        const item = store.items.find((i) => i.id === itemId);
        return fail("msg.insufficientStock", item?.nameAr ?? itemId);
      }
    }

    const ts = h.now();
    const today = new Date().toISOString().slice(0, 10);
    for (const part of pending) {
      store.stockMoves.push({
        id: h.id(),
        date: today,
        itemId: part.itemId,
        warehouseId: part.warehouseId,
        qtyDelta: -part.qty,
        type: "service",
        refType: "service_job",
        refId: row.id,
        unitCost: store.items.find((i) => i.id === part.itemId)?.cost ?? 0,
        note: row.number,
        createdAt: ts,
        updatedAt: ts,
      });
      part.consumed = true;
    }
    row.updatedAt = ts;
    return ok(pending.length);
  });
  if (!outcome.ok) return outcome;

  refresh(id);
  return outcome;
}

async function setJobStatusImpl(id: string, status: ServiceStatus): Promise<Result> {
  const gate = await guard("service", "edit");
  if (!gate.ok) return gate;
  const parsed = parse(() => oneOf(status, "status", SERVICE_STATUSES));
  if (!parsed.ok) return parsed;

  const outcome = await transaction((db, h): Result => {
    const row = db.serviceJobs.find((j) => j.id === id);
    if (!row) return fail("msg.error", "not-found");
    const ts = h.now();
    row.status = parsed.data;
    row.closedAt = parsed.data === "delivered" ? ts : null;
    row.updatedAt = ts;
    return ok(undefined);
  });
  if (!outcome.ok) return outcome;

  refresh(id);
  return ok(undefined);
}

async function deleteJobImpl(id: string): Promise<Result> {
  const gate = await guard("service", "edit");
  if (!gate.ok) return gate;

  const outcome = await transaction((db): Result => {
    const index = db.serviceJobs.findIndex((j) => j.id === id);
    if (index === -1) return fail("msg.error", "not-found");
    if (db.serviceJobs[index].parts.some((p) => p.consumed)) return fail("msg.error", "has-stock-moves");
    db.serviceJobs.splice(index, 1);
    return ok(undefined);
  });
  if (!outcome.ok) return outcome;

  refresh();
  return ok(undefined);
}

/* ------------------------------------------------------------------ */
/* Public actions. Each runs its implementation inside `attempt`, so an   */
/* unexpected failure is returned as a Result rather than thrown.        */
/* ------------------------------------------------------------------ */

export async function saveJob(...args: Parameters<typeof saveJobImpl>): ReturnType<typeof saveJobImpl> {
  return attempt(() => saveJobImpl(...args));
}

export async function consumeParts(...args: Parameters<typeof consumePartsImpl>): ReturnType<typeof consumePartsImpl> {
  return attempt(() => consumePartsImpl(...args));
}

export async function setJobStatus(...args: Parameters<typeof setJobStatusImpl>): ReturnType<typeof setJobStatusImpl> {
  return attempt(() => setJobStatusImpl(...args));
}

export async function deleteJob(...args: Parameters<typeof deleteJobImpl>): ReturnType<typeof deleteJobImpl> {
  return attempt(() => deleteJobImpl(...args));
}
