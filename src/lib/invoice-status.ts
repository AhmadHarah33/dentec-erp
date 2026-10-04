/**
 * Keeps an issued invoice's status in step with the payments against it.
 *
 * Server-only library code, not a server action: it used to be exported from
 * a "use server" file, which made it a public endpoint any browser could
 * call. It is only ever called by actions that have already been authorised.
 */

import "server-only";
import { snapshot, update } from "@/lib/data/repository";
import { computeTotals, toBase } from "@/lib/money";
import { paidForInvoice } from "@/lib/queries";

/** Recompute paid/partial/issued from the payments actually recorded. */
export async function syncStatus(invoiceId: string): Promise<void> {
  const db = await snapshot();
  const invoice = db.salesInvoices.find((i) => i.id === invoiceId);
  if (!invoice || invoice.status === "draft" || invoice.status === "void") return;

  const totals = computeTotals(invoice.lines, invoice.discountKind, invoice.discountValue);
  const total = toBase(totals.total, invoice.fxRate);
  const paid = paidForInvoice(db.payments, invoiceId);

  const status =
    paid <= 0.005 ? "issued" : paid + 0.005 >= total ? "paid" : "partial";

  if (status !== invoice.status) await update("salesInvoices", invoiceId, { status });
}

