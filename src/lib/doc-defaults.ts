/**
 * Shape and defaults for the sales/purchase document editor.
 *
 * Deliberately NOT in the editor component: that file is "use client", and a
 * server page cannot call a function defined in a client module. Keeping the
 * defaults here lets the page build the initial document and pass it down.
 */

import type { CurrencyCode, DiscountKind, DocumentLine, Settings } from "./data/types";
import { addDays, today } from "./dates";

export interface EditorDoc {
  partyId: string;
  warehouseId: string;
  date: string;
  /** dueDate for a sales invoice, expectedDate for a purchase order. */
  secondDate: string;
  currency: CurrencyCode;
  fxRate: number;
  discountKind: DiscountKind;
  discountValue: number;
  lines: DocumentLine[];
  notes: string;
}

export function blankDoc(
  kind: "sales" | "purchase",
  settings: Settings,
  defaultWarehouseId: string,
  partyId = "",
): EditorDoc {
  return {
    partyId,
    warehouseId: defaultWarehouseId,
    date: today(),
    // Sales default to net-30; purchases to a three-week lead time.
    secondDate: addDays(today(), kind === "sales" ? 30 : 21),
    currency: settings.baseCurrency,
    fxRate: 1,
    discountKind: "percent",
    discountValue: 0,
    lines: [],
    notes: "",
  };
}
