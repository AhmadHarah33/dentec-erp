"use server";

import { revalidatePath } from "next/cache";
import { create, remove, snapshot, transaction } from "@/lib/data/repository";
import type { Warehouse } from "@/lib/data/types";
import { buildStockIndex, onHand } from "@/lib/stock";
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
  if (!input.nameAr.trim()) return fail("msg.requiredField");

  const rowId = await transaction((db, h) => {
    // Exactly one default, always — cleared in the same write that sets the new one.
    if (input.isDefault) {
      for (const w of db.warehouses) w.isDefault = false;
    }

    if (id) {
      const index = db.warehouses.findIndex((w) => w.id === id);
      if (index === -1) throw new Error("warehouse not found");
      db.warehouses[index] = { ...db.warehouses[index], ...input, updatedAt: h.now() };
      return id;
    }

    const ts = h.now();
    const row = { ...input, id: h.id(), createdAt: ts, updatedAt: ts };
    db.warehouses.push(row);
    return row.id;
  });

  refresh();
  return ok(rowId);
}

export async function deleteWarehouse(id: string): Promise<Result> {
  const db = await snapshot();
  if (db.stockMoves.some((m) => m.warehouseId === id)) {
    return fail("msg.error", "warehouse-has-moves");
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
 */
export async function adjustStock(input: {
  itemId: string;
  warehouseId: string;
  qtyDelta: number;
  date: string;
  note: string;
}): Promise<Result> {
  if (!input.itemId || !input.warehouseId) return fail("msg.requiredField");
  if (!input.qtyDelta) return fail("msg.requiredField");

  const db = await snapshot();
  const index = buildStockIndex(db.stockMoves);
  const current = onHand(index, input.itemId, input.warehouseId);
  if (current + input.qtyDelta < 0) return fail("msg.insufficientStock");

  const item = db.items.find((i) => i.id === input.itemId);

  await create("stockMoves", {
    date: input.date,
    itemId: input.itemId,
    warehouseId: input.warehouseId,
    qtyDelta: input.qtyDelta,
    type: "adjustment",
    refType: "manual",
    refId: null,
    unitCost: item?.cost ?? 0,
    note: input.note,
  });

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
  if (input.fromWarehouseId === input.toWarehouseId) return fail("msg.error", "same-warehouse");
  if (input.qty <= 0) return fail("msg.requiredField");

  const db = await snapshot();
  const index = buildStockIndex(db.stockMoves);
  if (onHand(index, input.itemId, input.fromWarehouseId) < input.qty) {
    return fail("msg.insufficientStock");
  }

  const item = db.items.find((i) => i.id === input.itemId);
  const cost = item?.cost ?? 0;

  await transaction((db, h) => {
    const ts = h.now();
    const common = {
      date: input.date,
      itemId: input.itemId,
      type: "transfer" as const,
      refType: "transfer" as const,
      refId: null,
      unitCost: cost,
      note: input.note,
      createdAt: ts,
      updatedAt: ts,
    };
    db.stockMoves.push(
      { ...common, id: h.id(), warehouseId: input.fromWarehouseId, qtyDelta: -input.qty },
      { ...common, id: h.id(), warehouseId: input.toWarehouseId, qtyDelta: input.qty },
    );
  });

  refresh();
  return ok(undefined);
}
