/**
 * Assembling a printable document from the store.
 *
 * The print route and the PDF route both need exactly this, and if they
 * derived it separately the paper copy and the download could disagree about
 * a tax band or an exemption note. One loader, two consumers.
 */

import { snapshot } from "@/lib/data/repository";
import type { Locale } from "@/lib/i18n";
import type { SheetProps } from "@/components/print/document-sheet";
import { resolveDocumentType, resolveRegion } from "@/lib/billing/region";
import { buildExportView } from "@/lib/billing/export-sy";

export type DocumentKind = "invoice" | "purchase";

export function isDocumentKind(v: string): v is DocumentKind {
  return v === "invoice" || v === "purchase";
}

/**
 * `null` means "no such document" — the caller turns that into a 404. Anything
 * that is genuinely broken still throws.
 */
export async function loadDocument(
  kind: DocumentKind,
  id: string,
  locale: Locale,
): Promise<SheetProps | null> {
  const db = await snapshot();
  const items = new Map(db.items.map((i) => [i.id, i]));

  if (kind === "purchase") {
    const order = db.purchaseOrders.find((o) => o.id === id);
    if (!order) return null;

    return {
      kind: "purchase",
      // A purchase order is Dentec buying, so the supplier's regime does not
      // apply — the document is always domestic paperwork.
      region: "TR",
      number: order.number,
      date: order.date,
      secondDate: order.expectedDate,
      currency: order.currency,
      lines: order.lines,
      discountKind: order.discountKind,
      discountValue: order.discountValue,
      notes: order.notes,
      party: db.suppliers.find((s) => s.id === order.supplierId),
      settings: db.settings,
      items,
      locale,
    };
  }

  const invoice = db.salesInvoices.find((i) => i.id === id);
  if (!invoice) return null;

  const customer = db.customers.find((c) => c.id === invoice.customerId);
  const region = resolveRegion(invoice.billingRegion ? invoice : customer);
  const documentType = resolveDocumentType(invoice, customer);

  // Serials: the schema tracks a serial number on a service job, not on an
  // invoice line, so the only serials we can honestly print are the ones on
  // the job this invoice was raised from. Untracked lines print a dash rather
  // than a guess.
  const serials: Record<string, string> = {};
  const job = db.serviceJobs.find((j) => j.invoiceId === invoice.id);
  if (job?.serialNo && job.machineItemId) {
    for (const line of invoice.lines) {
      if (line.itemId === job.machineItemId) serials[line.id] = job.serialNo;
    }
  }

  const exportView =
    region === "SY"
      ? buildExportView(invoice, customer, db.settings, locale)
      : null;

  return {
    kind: "invoice",
    region,
    documentType,
    number: invoice.number,
    date: invoice.date,
    secondDate: invoice.dueDate,
    currency: invoice.currency,
    lines: invoice.lines,
    discountKind: invoice.discountKind,
    discountValue: invoice.discountValue,
    notes: invoice.notes,
    party: customer,
    settings: db.settings,
    items,
    serials,
    dispatch: invoice.dispatch,
    restated: exportView?.restated ?? null,
    exemptionNote: exportView?.exemptionNote,
    locale,
  };
}

/** `INV-2026-0042.pdf` — the document number is already the right filename. */
export function pdfFilename(number: string): string {
  return `${number}.pdf`;
}
