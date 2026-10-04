"use server";

import { revalidatePath } from "next/cache";
import { transaction } from "@/lib/data/repository";
import type { PurchaseOrder } from "@/lib/data/types";
import { guard } from "@/lib/auth/server";
import { round2 } from "@/lib/money";
import { documentRefsExist, orderInput, quantitiesInput } from "@/lib/inputs";
import { date as checkDate, parse } from "@/lib/validate";
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
  // Only named fields are read: `receivedQty`, `receivedAt`, the number and
  // the received/partial/cancelled statuses are the server's to set.
  const parsed = parse(() => orderInput(input));
  if (!parsed.ok) return parsed;
  const data = parsed.data;
  if (!data.supplierId) return fail("msg.requiredField");
  if (data.lines.length === 0) return fail("empty.lines");
  if (data.lines.some((l) => l.qty <= 0)) return fail("msg.requiredField");

  const outcome = await transaction((db, h): Result<string> => {
    if (!documentRefsExist(db, data, db.suppliers, data.supplierId)) return fail("msg.error", "unknown-reference");
    const ts = h.now();

    if (id) {
      const row = db.purchaseOrders.find((o) => o.id === id);
      if (!row) return fail("msg.error", "not-found");
      // Once goods are on the shelf the lines are history, not a draft.
      if (row.status === "received" || row.status === "partial") return fail("msg.error", "already-received");
      // A line keeps what has been received against it; the browser cannot restate that.
      const received = new Map(row.lines.map((l) => [l.id, l.receivedQty]));
      Object.assign(row, data, {
        lines: data.lines.map((l) => ({ ...l, receivedQty: received.get(l.id) })),
        updatedAt: ts,
      });
      return ok(row.id);
    }

    const row: PurchaseOrder = {
      ...data,
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
    return ok(row.id);
  });

  if (outcome.ok) refresh(outcome.data);
  return outcome;
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
 *
 * What is outstanding is worked out inside the transaction. Worked out before
 * it, a double click received the same delivery twice.
 */
export async function receiveOrder(
  id: string,
  date: string,
  quantities?: Record<string, number>,
): Promise<Result<"received" | "partial">> {
  const gate = await guard("purchasing", "edit");
  if (!gate.ok) return gate;
  const parsed = parse(() => ({ date: checkDate(date, "date"), quantities: quantitiesInput(quantities) }));
  if (!parsed.ok) return parsed;
  const asked = parsed.data;

  const outcome = await transaction((store, h): Result<"received" | "partial"> => {
    const row = store.purchaseOrders.find((o) => o.id === id);
    if (!row) return fail("msg.error", "not-found");
    if (row.status === "received") return fail("msg.error", "already-received");
    if (row.status === "cancelled") return fail("msg.error", "cancelled");

    // Work out what this delivery brings, line by line, before touching anything.
    const arriving = new Map<string, number>();
    for (const line of row.lines) {
      const remaining = round2(line.qty - (line.receivedQty ?? 0));
      const wanted = asked.quantities ? (asked.quantities[line.id] ?? 0) : remaining;
      if (!Number.isFinite(wanted) || wanted < 0) return fail("msg.requiredField");
      if (wanted > remaining + 1e-9) return fail("purchase.overReceive");
      if (wanted > 0) arriving.set(line.id, round2(wanted));
    }
    if (arriving.size === 0) return fail("purchase.nothingToReceive");

    const ts = h.now();
    for (const line of row.lines) {
      const qty = arriving.get(line.id);
      if (!qty) continue;
      line.receivedQty = round2((line.receivedQty ?? 0) + qty);
      if (!line.itemId) continue;
      store.stockMoves.push({
        id: h.id(),
        date: asked.date,
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
    return ok(row.status as "received" | "partial");
  });
  if (!outcome.ok) return outcome;

  refresh(id);
  return outcome;
}

export async function cancelOrder(id: string): Promise<Result> {
  const gate = await guard("purchasing", "edit");
  if (!gate.ok) return gate;

  const outcome = await transaction((db, h): Result => {
    const order = db.purchaseOrders.find((o) => o.id === id);
    if (!order) return fail("msg.error", "not-found");
    // Goods already on the shelf cannot be un-ordered; the ledger would disagree.
    if (order.status === "received" || order.status === "partial") return fail("msg.error", "already-received");
    order.status = "cancelled";
    order.updatedAt = h.now();
    return ok(undefined);
  });
  if (!outcome.ok) return outcome;

  refresh(id);
  return ok(undefined);
}

export async function deleteOrder(id: string): Promise<Result> {
  const gate = await guard("purchasing", "edit");
  if (!gate.ok) return gate;

  const outcome = await transaction((db): Result => {
    const index = db.purchaseOrders.findIndex((o) => o.id === id);
    if (index === -1) return fail("msg.error", "not-found");
    if (db.purchaseOrders[index].status !== "draft") return fail("msg.error", "not-a-draft");
    db.purchaseOrders.splice(index, 1);
    return ok(undefined);
  });
  if (!outcome.ok) return outcome;

  refresh();
  return ok(undefined);
}
