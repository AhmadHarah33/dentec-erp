"use server";

import { revalidatePath } from "next/cache";
import { create, remove, snapshot, transaction } from "@/lib/data/repository";
import type { Warehouse } from "@/lib/data/types";
import { buildStockIndex, onHand } from "@/lib/stock";
import { guard } from "@/lib/auth/server";
import { adjustInput, transferInput, warehouseInput } from "@/lib/inputs";
import { parse } from "@/lib/validate";
import { fail, ok, STOCK_PATHS, type Result } from "./shared";

type WarehouseInput = Omit<Warehouse, "id" | "createdAt" | "updatedAt">;

function refresh() {
  for (const p of STOCK_PATHS) revalidatePath(p);
}

/* ------------------------------------------------------------------ */
/* Warehouses                                                          */
/* ------------------------------------------------------------------ */

export async function saveWarehouse(
  id: string | null,
  input: WarehouseInput,
): Promise<Result<string>> {
  const gate = await guard("settings", "edit");
  if (!gate.ok) return gate;
  const parsed = parse(() => warehouseInput(input));
  if (!parsed.ok) return parsed;
  const data = parsed.data;
  if (!data.nameAr.trim()) return fail("msg.requiredField");

  const rowId = await transaction((db, h) => {
    // Exactly one default, always — cleared in the same write that sets the new one.
    if (data.isDefault) {
      for (const w of db.warehouses) w.isDefault = false;
    }

    if (id) {
      const index = db.warehouses.findIndex((w) => w.id === id);
      if (index === -1) return null;
      db.warehouses[index] = { ...db.warehouses[index], ...data, updatedAt: h.now() };
      return id;
    }

    const ts = h.now();
    const row = { ...data, id: h.id(), createdAt: ts, updatedAt: ts };
    db.warehouses.push(row);
    return row.id;
  });
  if (rowId === null) return fail("msg.error", "not-found");

  refresh();
  return ok(rowId);
}

export async function deleteWarehouse(id: string): Promise<Result> {
  const gate = await guard("settings", "edit");
  if (!gate.ok) return gate;
  const db = await snapshot();
  if (db.stockMoves.some((m) => m.warehouseId === id)) {
    return fail("msg.error", "warehouse-has-moves");
  }
  // A draft document or a planned service part names the warehouse too; the
  // database's foreign keys would refuse the delete, so refuse it here first
  // with a message instead of an error page.
  if (
    db.salesInvoices.some((i) => i.warehouseId === id) ||
    db.purchaseOrders.some((o) => o.warehouseId === id) ||
    db.serviceJobs.some((j) => j.parts.some((p) => p.warehouseId === id))
  ) {
    return fail("msg.error", "warehouse-in-use");
  }
  if (db.warehouses.length <= 1) return fail("msg.error", "last-warehouse");
  await remove("warehouses", id);
  refresh();
  return ok(undefined);
}

/* ------------------------------------------------------------------ */
/* Ledger writes                                                       */
/* ------------------------------------------------------------------ */

/**
 * A manual correction. Recorded as a move like any other — the ledger stays
 * append-only, so the count that changed the number is always visible.
 *
 * The balance is read inside the transaction that writes the move. Read
 * before it, two simultaneous corrections both saw enough stock.
 */
export async function adjustStock(input: {
  itemId: string;
  warehouseId: string;
  qtyDelta: number;
  date: string;
  note: string;
}): Promise<Result> {
  const gate = await guard("inventory", "edit");
  if (!gate.ok) return gate;
  const parsed = parse(() => adjustInput(input));
  if (!parsed.ok) return parsed;
  const data = parsed.data;
  if (!data.itemId || !data.warehouseId) return fail("msg.requiredField");
  if (!data.qtyDelta) return fail("msg.requiredField");

  const outcome = await transaction((db, h): Result => {
    const item = db.items.find((i) => i.id === data.itemId);
    if (!item || !db.warehouses.some((w) => w.id === data.warehouseId)) return fail("msg.error", "unknown-reference");

    const current = onHand(buildStockIndex(db.stockMoves), data.itemId, data.warehouseId);
    if (current + data.qtyDelta < 0) return fail("msg.insufficientStock");

    const ts = h.now();
    db.stockMoves.push({
      id: h.id(),
      date: data.date,
      itemId: data.itemId,
      warehouseId: data.warehouseId,
      qtyDelta: data.qtyDelta,
      type: "adjustment",
      refType: "manual",
      refId: null,
      unitCost: item.cost ?? 0,
      note: data.note,
      createdAt: ts,
      updatedAt: ts,
    });
    return ok(undefined);
  });
  if (!outcome.ok) return outcome;

  refresh();
  return ok(undefined);
}

/** Two opposing moves, written together so a transfer can never half-happen. */
export async function transferStock(input: {
  itemId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  qty: number;
  date: string;
  note: string;
}): Promise<Result> {
  const gate = await guard("inventory", "edit");
  if (!gate.ok) return gate;
  const parsed = parse(() => transferInput(input));
  if (!parsed.ok) return parsed;
  const data = parsed.data;
  if (data.fromWarehouseId === data.toWarehouseId) return fail("msg.error", "same-warehouse");
  if (data.qty <= 0) return fail("msg.requiredField");

  const outcome = await transaction((db, h): Result => {
    const item = db.items.find((i) => i.id === data.itemId);
    if (
      !item ||
      !db.warehouses.some((w) => w.id === data.fromWarehouseId) ||
      !db.warehouses.some((w) => w.id === data.toWarehouseId)
    ) {
      return fail("msg.error", "unknown-reference");
    }
    if (onHand(buildStockIndex(db.stockMoves), data.itemId, data.fromWarehouseId) < data.qty) {
      return fail("msg.insufficientStock");
    }

    const ts = h.now();
    const common = {
      date: data.date,
      itemId: data.itemId,
      type: "transfer" as const,
      refType: "transfer" as const,
      refId: null,
      unitCost: item.cost ?? 0,
      note: data.note,
      createdAt: ts,
      updatedAt: ts,
    };
    db.stockMoves.push(
      { ...common, id: h.id(), warehouseId: data.fromWarehouseId, qtyDelta: -data.qty },
      { ...common, id: h.id(), warehouseId: data.toWarehouseId, qtyDelta: data.qty },
    );
    return ok(undefined);
  });
  if (!outcome.ok) return outcome;

  refresh();
  return ok(undefined);
}
