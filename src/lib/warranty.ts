/**
 * Warranty status of a sold unit. A unit with no end date was sold without a
 * warranty; the end date itself is the last covered day.
 */

import type { ISODate, MachineUnit } from "./data/types";

export type WarrantyState = "active" | "expired" | "none";

export function warrantyState(unit: Pick<MachineUnit, "warrantyEnd">, on: ISODate): WarrantyState {
  if (!unit.warrantyEnd) return "none";
  return unit.warrantyEnd >= on ? "active" : "expired";
}
