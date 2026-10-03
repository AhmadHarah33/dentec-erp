"use server";

import { revalidatePath } from "next/cache";
import { remove, snapshot, transaction, update } from "@/lib/data/repository";
import type { PurchaseOrder } from "@/lib/data/types";
import { guard } from "@/lib/auth/server";
import { round2 } from "@/lib/money";
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
  const gate = await guard("purchasing", "edit");
  if (!gate.ok) return gate;
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
 * Book goods in — all of an order, or part of it. `quantities` maps a line id
 * to how much of it arrived in this delivery; leave it out to receive
 * everything still outstanding. Each delivery writes its own stock moves, so
 * the ledger shows when each part of an order came in.
 *
 * The unit cost recorded on each move is the price actually paid on this
 * order, not the item's standard cost — that is what makes a landed-cost
 * report possible later.
 */
export async function receiveOrder(
  id: string,
  date: string,
  quantities?: Record<string, number>,
): Promise<Result<"received" | "partial">> {
  const gate = await guard("purchasing", "edit");
  if (!gate.ok) return gate;
  const db = await snapshot();
  const order = db.purchaseOrders.find((o) => o.id === id);
  if (!order) return fail("msg.error", "not-found");
  if (order.status === "received") return fail("msg.error", "already-received");
  if (order.status === "cancelled") return fail("msg.error", "cancelled");

  // Work out what this delivery brings, line by line, before touching anything.
  const arriving = new Map<string, number>();
  for (const line of order.lines) {
    const remaining = round2(line.qty - (line.receivedQty ?? 0));
    const asked = quantities ? (quantities[line.id] ?? 0) : remaining;
    if (!Number.isFinite(asked) || asked < 0) return fail("msg.requiredField");
    if (asked > remaining + 1e-9) return fail("purchase.overReceive");
    if (asked > 0) arriving.set(line.id, round2(asked));
  }
  if (arriving.size === 0) return fail("purchase.nothingToReceive");

  const outcome = await transaction((store, h) => {
    const row = store.purchaseOrders.find((o) => o.id === id)!;
    const ts = h.now();

    for (const line of row.lines) {
      const qty = arriving.get(line.id);
      if (!qty) continue;
      line.receivedQty = round2((line.receivedQty ?? 0) + qty);
      if (!line.itemId) continue;
      store.stockMoves.push({
        id: h.id(),
        date,
        itemId: line.itemId,
        warehouseId: row.warehouseId,
        qtyDelta: qty,
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

    const complete = row.lines.every((l) => round2(l.qty - (l.receivedQty ?? 0)) <= 0);
    row.status = complete ? "received" : "partial";
    if (complete) row.receivedAt = ts;
    row.updatedAt = ts;
    return row.status as "received" | "partial";
  });

  refresh(id);
  return ok(outcome);
}

export async function cancelOrder(id: string): Promise<Result> {
  const gate = await guard("purchasing", "edit");
  if (!gate.ok) return gate;
  const db = await snapshot();
  const order = db.purchaseOrders.find((o) => o.id === id);
  if (!order) return fail("msg.error", "not-found");
  // Goods already on the shelf cannot be un-ordered; the ledger would disagree.
  if (order.status === "received" || order.status === "partial") return fail("msg.error", "already-received");
  await update("purchaseOrders", id, { status: "cancelled" });
  refresh(id);
  return ok(undefined);
}

export async function deleteOrder(id: string): Promise<Result> {
  const gate = await guard("purchasing", "edit");
  if (!gate.ok) return gate;
  const db = await snapshot();
  const order = db.purchaseOrders.find((o) => o.id === id);
  if (!order) return fail("msg.error", "not-found");
  if (order.status !== "draft") return fail("msg.error", "not-a-draft");
  await remove("purchaseOrders", id);
  refresh();
  return ok(undefined);
}
