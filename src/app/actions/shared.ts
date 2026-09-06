import type { MessageKey } from "@/lib/i18n";

/**
 * Actions return a result rather than throwing, so a rejected write shows the
 * user a sentence instead of an error page. `errorKey` is a dictionary key so
 * the message arrives in the user's language.
 */
export type Result<T = void> =
  | { ok: true; data: T }
  | { ok: false; errorKey: MessageKey; detail?: string };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail(errorKey: MessageKey, detail?: string): Result<never> {
  return { ok: false, errorKey, detail };
}

/** Paths that show stock figures and must be refreshed after any ledger write. */
export const STOCK_PATHS = [
  "/",
  "/inventory",
  "/inventory/moves",
  "/settings/warehouses",
  "/products",
  "/spare-parts",
  "/reports",
];
