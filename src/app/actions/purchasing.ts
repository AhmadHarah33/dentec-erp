"use server";

import { revalidatePath } from "next/cache";
import { remove, snapshot, transaction, update } from "@/lib/data/repository";
import type { PurchaseOrder } from "@/lib/data/types";
import { fail, ok, STOCK_PATHS, type Result } from "./shared";

type OrderInput = Omit<PurchaseOrder, "id" | "createdAt" | "updatedAt" | "number" | "receivedAt">;

function refresh(id?: string) {
  for (const p of [...STOCK_PATHS, "/purchases", "/suppliers", "/accounting"]) {
    revalidatePath(p);
  }
  if (id) revalidatePath(`/purchases/${id}`);
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

export async function saveOrder(id: string | null, input: OrderInput): Promise<Result<string>> {
  if (!input.supplierId) return fail("msg.requiredField");
  if (input.lines.length === 0) return fail("empty.lines");
  if (input.lines.some((l) => l.qty <= 0)) return fail("msg.requiredField");

  if (id) {
    const db = await snapshot();
    const existing = db.purchaseOrders.find((o) => o.id === id);
    // Once goods are on the shelf the lines are history, not a draft.
    if (existing && (existing.status === "received" || existing.status === "partial")) {
      return fail("msg.error", "already-received");
    }
    const row = await update("purchaseOrders", id, input);
    refresh(row.id);
    return ok(row.id);
  }

  const newId = await transaction((db, h) => {
    const ts = h.now();
    const row: PurchaseOrder = {
      ...input,
      id: h.id(),
      number: nextNumber(
        db.purchaseOrders.map((o) => o.number),
        db.settings.purchasePrefix,
      ),
      receivedAt: null,
      createdAt: ts,
      updatedAt: ts,
    };
    db.purchaseOrders.push(row);
    return row.id;
  });

  refresh(newId);
  return ok(newId);
}

/**
 * Book the goods in. The unit cost recorded on each move is the price actually
 * paid on this order, not the item's standard cost — that is what makes a
 * landed-cost report possible later.
 */
export async function receiveOrder(id: string, date: string): Promise<Result> {
  const db = await snapshot();
  const order = db.purchaseOrders.find((o) => o.id === id);
  if (!order) return fail("msg.error", "not-found");
  if (order.status === "received") return fail("msg.error", "already-received");
  if (order.status === "cancelled") return fail("msg.error", "cancelled");

  await transaction((store, h) => {
    const row = store.purchaseOrders.find((o) => o.id === id)!;
    const ts = h.now();

    for (const line of row.lines) {
      if (!line.itemId) continue;
      store.stockMoves.push({
        id: h.id(),
        date,
        itemId: line.itemId,
        warehouseId: row.warehouseId,
        qtyDelta: line.qty,
        type: "purchase",
        refType: "purchase_order",
        refId: row.id,
        // Order prices are in the order's currency; the ledger is in base.
        unitCost: line.unitPrice * (row.fxRate || 1),
        note: row.number,
        createdAt: ts,
        updatedAt: ts,
      });
    }

    row.status = "received";
    row.receivedAt = ts;
    row.updatedAt = ts;
  });

  refresh(id);
  return ok(undefined);
}

export async function cancelOrder(id: string): Promise<Result> {
  const db = await snapshot();
  const order = db.purchaseOrders.find((o) => o.id === id);
  if (!order) return fail("msg.error", "not-found");
  if (order.status === "received") return fail("msg.error", "already-received");
  await update("purchaseOrders", id, { status: "cancelled" });
  refresh(id);
  return ok(undefined);
}

export async function deleteOrder(id: string): Promise<Result> {
  const db = await snapshot();
  const order = db.purchaseOrders.find((o) => o.id === id);
  if (!order) return fail("msg.error", "not-found");
  if (order.status !== "draft") return fail("msg.error", "not-a-draft");
  await remove("purchaseOrders", id);
  refresh();
  return ok(undefined);
}
