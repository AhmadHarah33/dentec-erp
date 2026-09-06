import type { Item, ServiceJob } from "./data/types";
import { onHand, type StockIndex } from "./stock";

/** One part a job needs and the workshop cannot supply yet. */
export interface Shortage {
  itemId: string;
  /** How many the job still needs — consumed parts are already out of stock. */
  needed: number;
  onHand: number;
  /** How many are missing. Always positive; a satisfied part is not returned. */
  short: number;
}

/**
 * What a job is waiting for.
 *
 * Only parts not yet consumed count: a consumed part has already left the
 * ledger, so counting it again would report a shortage that does not exist.
 * Quantities are summed per item first, because two lines of the same part
 * compete for the same stock.
 */
export function jobShortages(job: ServiceJob, index: StockIndex): Shortage[] {
  const needed = new Map<string, number>();
  for (const part of job.parts) {
    if (part.consumed) continue;
    needed.set(part.itemId, (needed.get(part.itemId) ?? 0) + part.qty);
  }

  const out: Shortage[] = [];
  for (const [itemId, qty] of needed) {
    const have = onHand(index, itemId);
    if (have >= qty) continue;
    out.push({ itemId, needed: qty, onHand: have, short: qty - have });
  }
  return out;
}

/** Shortage counts for a whole board, keyed by job id. Jobs in the clear are omitted. */
export function shortagesByJob(jobs: ServiceJob[], index: StockIndex): Record<string, number> {
  const map: Record<string, number> = {};
  for (const job of jobs) {
    const short = jobShortages(job, index);
    if (short.length > 0) map[job.id] = short.length;
  }
  return map;
}

/** True when the job has something worth putting on an invoice. */
export function jobIsBillable(job: ServiceJob, items: Item[]): boolean {
  if (job.underWarranty) return false;
  if (job.laborCharge > 0) return true;
  return job.parts.some((p) => partPrice(p.unitPrice, p.itemId, items) > 0);
}

/** A part's price, falling back to the item's list price when the line carries none. */
export function partPrice(unitPrice: number, itemId: string, items: Item[]): number {
  if (unitPrice > 0) return unitPrice;
  return items.find((i) => i.id === itemId)?.price ?? 0;
}
