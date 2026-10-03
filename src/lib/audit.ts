/**
 * Reading the audit log. Server-only: the log holds before/after values for
 * every record, so who may read it is decided by the callers, never here.
 */

import "server-only";
import { database } from "@/lib/data/store";
import type { Area } from "@/lib/permissions";

export interface AuditRow {
  id: number;
  at: string;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  collection: string;
  recordId: string;
  label: string;
  action: "insert" | "update" | "delete";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/** The permission area a collection belongs to: who may read its history. */
export const COLLECTION_AREA: Record<string, Area> = {
  settings: "settings",
  users: "settings",
  categories: "catalog",
  items: "catalog",
  warehouses: "inventory",
  customers: "customers",
  suppliers: "purchasing",
  purchaseOrders: "purchasing",
  salesInvoices: "invoices",
  payments: "finance",
  expenses: "finance",
  serviceJobs: "service",
};

export const AUDIT_PAGE = 50;

function toRow(r: Record<string, unknown>): AuditRow {
  return {
    id: Number(r.id),
    at: new Date(r.at as string).toISOString(),
    actorId: (r.actor_id as string | null) ?? null,
    actorName: r.actor_name as string,
    actorRole: r.actor_role as string,
    collection: r.collection as string,
    recordId: r.record_id as string,
    label: r.label as string,
    action: r.action as AuditRow["action"],
    before: (r.before as AuditRow["before"]) ?? null,
    after: (r.after as AuditRow["after"]) ?? null,
  };
}

export async function listAudit(opts: {
  collection?: string;
  recordId?: string;
  actorId?: string;
  /** Keyset cursor: only entries older than this id. */
  beforeId?: number;
  limit?: number;
}): Promise<AuditRow[]> {
  const sql = database();
  const limit = Math.min(opts.limit ?? AUDIT_PAGE, 200);
  const rows = await sql`
    select * from erp.audit_log
    where (${opts.collection ?? null}::text is null or collection = ${opts.collection ?? null})
      and (${opts.recordId ?? null}::text is null or record_id = ${opts.recordId ?? null})
      and (${opts.actorId ?? null}::text is null or actor_id = ${opts.actorId ?? null})
      and (${opts.beforeId ?? null}::bigint is null or id < ${opts.beforeId ?? null})
    order by id desc
    limit ${limit}`;
  return rows.map(toRow);
}
