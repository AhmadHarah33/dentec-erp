/**
 * Stock derivation. On-hand is never stored — it is summed from the
 * append-only `stockMoves` ledger every time it is needed. That is what makes
 * inventory auditable: every unit on the shelf traces back to a document.
 */

import type { ID, Item, StockMove } from "./data/types";
import { round2 } from "./money";

/** Key for the per-warehouse map. */
function key(itemId: ID, warehouseId: ID): string {
  return itemId + "|" + warehouseId;
}

export interface StockIndex {
  /** Total on-hand per item, across every warehouse. */
  byItem: Map<ID, number>;
  /** On-hand per item per warehouse. */
  byItemWarehouse: Map<string, number>;
  /** Last movement date per item, for slow-mover reporting. */
  lastMove: Map<ID, string>;
}

/**
 * Build every on-hand figure in one pass. Pages that show a stock column call
 * this once and read from the maps, rather than re-scanning the ledger per row.
 */
export function buildStockIndex(moves: StockMove[]): StockIndex {
  const byItem = new Map<ID, number>();
  const byItemWarehouse = new Map<string, number>();
  const lastMove = new Map<ID, string>();

  for (const m of moves) {
    byItem.set(m.itemId, (byItem.get(m.itemId) ?? 0) + m.qtyDelta);
    const k = key(m.itemId, m.warehouseId);
    byItemWarehouse.set(k, (byItemWarehouse.get(k) ?? 0) + m.qtyDelta);

    const prev = lastMove.get(m.itemId);
    if (!prev || m.date > prev) lastMove.set(m.itemId, m.date);
  }

  return { byItem, byItemWarehouse, lastMove };
}

export function onHand(index: StockIndex, itemId: ID, warehouseId?: ID): number {
  const n = warehouseId
    ? index.byItemWarehouse.get(key(itemId, warehouseId)) ?? 0
    : index.byItem.get(itemId) ?? 0;
  // Ledgers of fractional units (metres, kg) accumulate float dust.
  return round2(n);
}

/** Valuation at standard cost. Documented as such wherever it is displayed. */
export function stockValue(items: Item[], index: StockIndex): number {
  return round2(
    items.reduce((sum, item) => sum + onHand(index, item.id) * item.cost, 0),
  );
}

export type StockHealth = "out" | "low" | "ok";

export function stockHealth(qty: number, minStock: number): StockHealth {
  if (qty <= 0) return "out";
  if (minStock > 0 && qty <= minStock) return "low";
  return "ok";
}

export interface LowStockRow {
  item: Item;
  qty: number;
  health: StockHealth;
  shortfall: number;
}

/** Items at or below their reorder point, worst first. */
export function lowStock(items: Item[], index: StockIndex): LowStockRow[] {
  return items
    .filter((i) => i.active)
    .map((item) => {
      const qty = onHand(index, item.id);
      return {
        item,
        qty,
        health: stockHealth(qty, item.minStock),
        shortfall: round2(Math.max(item.minStock - qty, 0)),
      };
    })
    .filter((r) => r.health !== "ok")
    .sort((a, b) => {
      if (a.health !== b.health) return a.health === "out" ? -1 : 1;
      return b.shortfall - a.shortfall;
    });
}
