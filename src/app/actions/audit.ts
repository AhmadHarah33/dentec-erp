"use server";

import { guard } from "@/lib/auth/server";
import { COLLECTION_AREA, listAudit, type AuditRow } from "@/lib/audit";
import { fail, ok, type Result } from "./shared";

/**
 * The change history of one record, for the "History" card on its page.
 * Readable by whoever may edit the area the record belongs to: the log holds
 * old and new values, which can include prices and costs.
 */
export async function recordHistory(collection: string, recordId: string): Promise<Result<AuditRow[]>> {
  const area = COLLECTION_AREA[collection];
  if (!area) return fail("msg.error", "unknown-collection");
  const gate = await guard(area, "edit");
  if (!gate.ok) return gate;
  return ok(await listAudit({ collection, recordId, limit: 100 }));
}
