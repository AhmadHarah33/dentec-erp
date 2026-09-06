"use server";

import { revalidatePath } from "next/cache";
import { remove, snapshot, transaction, update } from "@/lib/data/repository";
import type { ServiceJob, ServiceStatus } from "@/lib/data/types";
import { buildStockIndex, onHand } from "@/lib/stock";
import { fail, ok, STOCK_PATHS, type Result } from "./shared";

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

export async function saveJob(id: string | null, input: JobInput): Promise<Result<string>> {
  if (!input.customerId) return fail("msg.requiredField");
  if (!input.reportedFault.trim()) return fail("msg.requiredField");

  if (id) {
    // Parts already taken from stock are frozen; only unconsumed ones may change.
    const db = await snapshot();
    const existing = db.serviceJobs.find((j) => j.id === id);
    if (existing) {
      const consumed = existing.parts.filter((p) => p.consumed);
      const kept = consumed.every((c) =>
        input.parts.some((p) => p.id === c.id && p.qty === c.qty && p.itemId === c.itemId),
      );
      if (!kept) return fail("msg.error", "consumed-parts-locked");
    }
    const row = await update("serviceJobs", id, input);
    refresh(row.id);
    return ok(row.id);
  }

  const newId = await transaction((db, h) => {
    const ts = h.now();
    const row: ServiceJob = {
      ...input,
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
    return row.id;
  });

  refresh(newId);
  return ok(newId);
}

/**
 * Take the listed parts out of the workshop. Only parts not already consumed
 * are moved, so pressing the button twice cannot double-deduct.
 */
export async function consumeParts(id: string): Promise<Result<number>> {
  const db = await snapshot();
  const job = db.serviceJobs.find((j) => j.id === id);
  if (!job) return fail("msg.error", "not-found");

  const pending = job.parts.filter((p) => !p.consumed);
  if (pending.length === 0) return ok(0);

  const index = buildStockIndex(db.stockMoves);
  const needed = new Map<string, number>();
  for (const p of pending) {
    const key = p.itemId + "|" + p.warehouseId;
    needed.set(key, (needed.get(key) ?? 0) + p.qty);
  }
  for (const [key, qty] of needed) {
    const [itemId, warehouseId] = key.split("|");
    if (onHand(index, itemId, warehouseId) < qty) {
      const item = db.items.find((i) => i.id === itemId);
      return fail("msg.insufficientStock", item?.nameAr ?? itemId);
    }
  }

  await transaction((store, h) => {
    const row = store.serviceJobs.find((j) => j.id === id)!;
    const ts = h.now();
    const today = new Date().toISOString().slice(0, 10);

    for (const part of row.parts) {
      if (part.consumed) continue;
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
  });

  refresh(id);
  return ok(pending.length);
}

export async function setJobStatus(id: string, status: ServiceStatus): Promise<Result> {
  const patch: Partial<ServiceJob> = { status };
  if (status === "delivered") patch.closedAt = new Date().toISOString();
  else patch.closedAt = null;
  await update("serviceJobs", id, patch);
  refresh(id);
  return ok(undefined);
}

export async function deleteJob(id: string): Promise<Result> {
  const db = await snapshot();
  const job = db.serviceJobs.find((j) => j.id === id);
  if (!job) return fail("msg.error", "not-found");
  if (job.parts.some((p) => p.consumed)) return fail("msg.error", "has-stock-moves");
  await remove("serviceJobs", id);
  refresh();
  return ok(undefined);
}
