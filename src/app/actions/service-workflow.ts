"use server";

import { revalidatePath } from "next/cache";
import { snapshot, transaction } from "@/lib/data/repository";
import type {
  DocumentLine,
  ID,
  PurchaseOrder,
  SalesInvoice,
  ServiceJob,
} from "@/lib/data/types";
import { buildStockIndex } from "@/lib/stock";
import { jobShortages, partPrice } from "@/lib/service";
import { addDays, today } from "@/lib/dates";
import { round2 } from "@/lib/money";
import { fail, ok, STOCK_PATHS, type Result } from "./shared";

/** Next number in a series, computed at write time so gaps are not created. */
function nextNumber(existing: string[], prefix: string): string {
  const year = new Date().getUTCFullYear();
  const head = `${prefix}-${year}-`;
  const highest = existing
    .filter((n) => n.startsWith(head))
    .map((n) => Number.parseInt(n.slice(head.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return head + String(highest + 1).padStart(4, "0");
}

function refreshAll(jobId: string) {
  for (const p of [...STOCK_PATHS, "/service", "/invoices", "/purchases", "/accounting"]) {
    revalidatePath(p);
  }
  revalidatePath(`/service/${jobId}`);
}

/* ------------------------------------------------------------------ */
/* Job → invoice                                                       */
/* ------------------------------------------------------------------ */

/**
 * Raise a draft invoice for a finished job.
 *
 * The important subtlety is stock. A part already consumed by the job has
 * left the ledger through a `service` move, so its invoice line must NOT
 * carry an itemId — `issueInvoice` deducts every line that has one, and the
 * unit would go out twice. Those lines become description-only, which is also
 * what the customer should read: they are being billed for a part fitted, not
 * for a part picked off a shelf.
 *
 * Parts NOT yet consumed keep their itemId, so issuing the invoice performs
 * the deduction that the job never did.
 *
 * The result is always a draft. Nothing is issued, nothing moves, and the
 * numbers are yours to correct before it goes to the customer.
 */
export async function invoiceJob(jobId: string): Promise<Result<string>> {
  const db = await snapshot();
  const job = db.serviceJobs.find((j) => j.id === jobId);
  if (!job) return fail("msg.error", "not-found");
  if (job.invoiceId && db.salesInvoices.some((i) => i.id === job.invoiceId)) {
    return fail("msg.jobAlreadyInvoiced");
  }

  const lines: DocumentLine[] = [];
  let seq = 0;
  const lineId = () => `${jobId}-l${++seq}`;

  for (const part of job.parts) {
    const item = db.items.find((i) => i.id === part.itemId);
    const price = partPrice(part.unitPrice, part.itemId, db.items);
    if (price <= 0) continue;
    lines.push({
      id: lineId(),
      itemId: part.consumed ? null : part.itemId,
      description: item?.nameAr ?? "",
      qty: part.qty,
      unitPrice: round2(price),
      discountPercent: 0,
      taxRate: item?.taxRate ?? db.settings.defaultTaxRate,
    });
  }

  if (job.laborCharge > 0) {
    lines.push({
      id: lineId(),
      itemId: null,
      description: `أجور صيانة — ${job.number}`,
      qty: 1,
      unitPrice: round2(job.laborCharge),
      discountPercent: 0,
      taxRate: db.settings.defaultTaxRate,
    });
  }

  if (lines.length === 0) return fail("msg.jobNoBillables");

  const warehouseId =
    job.parts[0]?.warehouseId ??
    db.warehouses.find((w) => w.isDefault)?.id ??
    db.warehouses[0]?.id ??
    "";

  const newId = await transaction((store, h) => {
    const ts = h.now();
    const invoice: SalesInvoice = {
      id: h.id(),
      number: nextNumber(
        store.salesInvoices.map((i) => i.number),
        store.settings.invoicePrefix,
      ),
      date: today(),
      dueDate: addDays(today(), 30),
      customerId: job.customerId,
      warehouseId,
      currency: store.settings.baseCurrency,
      fxRate: 1,
      status: "draft",
      discountKind: "percent",
      discountValue: 0,
      lines,
      notes: job.number,
      issuedAt: null,
      createdAt: ts,
      updatedAt: ts,
    };
    store.salesInvoices.push(invoice);

    const row = store.serviceJobs.find((j) => j.id === jobId)!;
    row.invoiceId = invoice.id;
    row.updatedAt = ts;

    return invoice.id;
  });

  refreshAll(jobId);
  return ok(newId);
}

/* ------------------------------------------------------------------ */
/* Shortage → purchase order                                           */
/* ------------------------------------------------------------------ */

/**
 * The supplier this part was last bought from.
 *
 * Items carry no supplier field, so the answer comes from history — the most
 * recent purchase order that contained the part. It is a guess, which is
 * exactly why the order is created as a draft for you to confirm.
 */
function lastSupplierFor(itemId: ID, orders: PurchaseOrder[]): ID | null {
  const sorted = [...orders].sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const po of sorted) {
    if (po.lines.some((l) => l.itemId === itemId)) return po.supplierId;
  }
  return null;
}

/**
 * Draft the purchase orders that would un-block a job, one per supplier, each
 * linked back to the job so receiving the goods tells you what it releases.
 *
 * Returns the ids created — one is the common case and the caller opens it.
 */
export async function orderShortage(jobId: string): Promise<Result<string[]>> {
  const db = await snapshot();
  const job = db.serviceJobs.find((j) => j.id === jobId);
  if (!job) return fail("msg.error", "not-found");

  const index = buildStockIndex(db.stockMoves);
  const short = jobShortages(job, index);
  if (short.length === 0) return fail("msg.noShortage");

  const fallback = db.suppliers.find((s) => s.active)?.id ?? db.suppliers[0]?.id;
  if (!fallback) return fail("msg.noSupplier");

  // One order per supplier: a draft addressed to the wrong company is worse
  // than two drafts addressed to the right ones.
  const bySupplier = new Map<ID, typeof short>();
  for (const s of short) {
    const supplierId = lastSupplierFor(s.itemId, db.purchaseOrders) ?? fallback;
    const bucket = bySupplier.get(supplierId);
    if (bucket) bucket.push(s);
    else bySupplier.set(supplierId, [s]);
  }

  const warehouseId =
    job.parts[0]?.warehouseId ??
    db.warehouses.find((w) => w.isDefault)?.id ??
    db.warehouses[0]?.id ??
    "";

  const ids = await transaction((store, h) => {
    const ts = h.now();
    const created: string[] = [];
    let seq = 0;

    for (const [supplierId, rows] of bySupplier) {
      const order: PurchaseOrder = {
        id: h.id(),
        // Read back from the store each pass: the order pushed on the previous
        // iteration is already in there, so two suppliers cannot collide.
        number: nextNumber(
          store.purchaseOrders.map((p) => p.number),
          store.settings.purchasePrefix,
        ),
        date: today(),
        expectedDate: addDays(today(), 21),
        supplierId,
        warehouseId,
        currency: store.settings.baseCurrency,
        fxRate: 1,
        status: "draft",
        discountKind: "percent",
        discountValue: 0,
        lines: rows.map((r) => {
          const item = store.items.find((i) => i.id === r.itemId);
          return {
            id: `${jobId}-p${++seq}`,
            itemId: r.itemId,
            description: item?.nameAr ?? "",
            qty: r.short,
            unitPrice: round2(item?.cost ?? 0),
            discountPercent: 0,
            taxRate: item?.taxRate ?? store.settings.defaultTaxRate,
          };
        }),
        notes: job.number,
        receivedAt: null,
        serviceJobId: jobId,
        createdAt: ts,
        updatedAt: ts,
      };
      store.purchaseOrders.push(order);
      created.push(order.id);
    }

    // A job that has been ordered for is a job waiting on parts.
    const row: ServiceJob = store.serviceJobs.find((j) => j.id === jobId)!;
    if (row.status !== "delivered" && row.status !== "done") {
      row.status = "awaiting_parts";
      row.updatedAt = ts;
    }

    return created;
  });

  refreshAll(jobId);
  return ok(ids);
}
