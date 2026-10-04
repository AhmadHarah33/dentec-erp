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

/** Postgres errors a person can act on, as the short code the UI shows after "error". */
function describeDbError(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  switch (code) {
    case "23503":
      return "reference-conflict"; // a row it points to is gone, or something still points at it
    case "23505":
      return "duplicate";
    case "23514":
    case "23502":
      return "invalid-value";
    case "40001":
    case "40P01":
      return "conflict-retry";
    default:
      return typeof code === "string" && code.startsWith("22") ? "invalid-value" : "internal";
  }
}

/** redirect(), notFound() and Next's own dynamic-rendering signals are thrown on purpose. */
function isControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_") || digest === "DYNAMIC_SERVER_USAGE");
}

/**
 * Run an action body so that an unexpected failure — a constraint the checks
 * did not foresee, a lost race on a unique key, a dropped connection — comes
 * back as a Result like every expected one, instead of an error screen. The
 * cause is logged in full; the person sees a short code.
 */
export async function attempt<T>(body: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await body();
  } catch (error) {
    if (isControlFlow(error)) throw error;
    console.error("[action] failed:", error instanceof Error ? error.message : error);
    return fail("msg.error", describeDbError(error));
  }
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
