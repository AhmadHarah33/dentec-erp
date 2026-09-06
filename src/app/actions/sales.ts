"use server";

import { revalidatePath } from "next/cache";
import { create, remove, snapshot, transaction, update } from "@/lib/data/repository";
import type { DocumentLine, SalesInvoice } from "@/lib/data/types";
import { buildStockIndex, onHand } from "@/lib/stock";
import { computeTotals, round2, toBase } from "@/lib/money";
import { paidForInvoice } from "@/lib/queries";
import { fail, ok, STOCK_PATHS, type Result } from "./shared";

type InvoiceInput = Omit<SalesInvoice, "id" | "createdAt" | "updatedAt" | "number" | "issuedAt">;

function refresh(id?: string) {
  for (const p of [...STOCK_PATHS, "/invoices", "/customers", "/accounting"]) {
    revalidatePath(p);
  }
  if (id) revalidatePath(`/invoices/${id}`);
}

/** Next number in the series, computed at write time so gaps are not created. */
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

function validate(lines: DocumentLine[]): Result<true> {
  if (lines.length === 0) return fail("empty.lines");
  if (lines.some((l) => !l.itemId && !l.description.trim())) return fail("msg.requiredField");
  if (lines.some((l) => l.qty <= 0)) return fail("msg.requiredField");
  return ok(true);
}

export async function saveInvoice(
  id: string | null,
  input: InvoiceInput,
): Promise<Result<string>> {
  const valid = validate(input.lines);
  if (!valid.ok) return valid;
  if (!input.customerId) return fail("msg.requiredField");

  if (id) {
    const db = await snapshot();
    const existing = db.salesInvoices.find((i) => i.id === id);
    // An issued invoice has already moved stock and may have payments against
    // it; editing the lines would silently desynchronise both.
    if (existing && existing.status !== "draft") return fail("msg.error", "not-a-draft");
    const row = await update("salesInvoices", id, input);
    refresh(row.id);
    return ok(row.id);
  }

  const newId = await transaction((db, h) => {
    const ts = h.now();
    const row: SalesInvoice = {
      ...input,
      id: h.id(),
      number: nextNumber(
        db.salesInvoices.map((i) => i.number),
        db.settings.invoicePrefix,
      ),
      issuedAt: null,
      createdAt: ts,
      updatedAt: ts,
    };
    db.salesInvoices.push(row);
    return row.id;
  });

  refresh(newId);
  return ok(newId);
}

/**
 * Move the invoice out of draft and take the goods off the shelf. The stock
 * check and the ledger writes happen in one transaction, so two people issuing
 * the last unit at once cannot both succeed.
 */
export async function issueInvoice(id: string): Promise<Result> {
  const db = await snapshot();
  const invoice = db.salesInvoices.find((i) => i.id === id);
  if (!invoice) return fail("msg.error", "not-found");
  if (invoice.status !== "draft") return fail("msg.error", "not-a-draft");

  const index = buildStockIndex(db.stockMoves);
  const needed = new Map<string, number>();
  for (const line of invoice.lines) {
    if (!line.itemId) continue;
    needed.set(line.itemId, (needed.get(line.itemId) ?? 0) + line.qty);
  }
  for (const [itemId, qty] of needed) {
    if (onHand(index, itemId, invoice.warehouseId) < qty) {
      const item = db.items.find((i) => i.id === itemId);
      return fail("msg.insufficientStock", item?.nameAr ?? itemId);
    }
  }

  await transaction((store, h) => {
    const row = store.salesInvoices.find((i) => i.id === id)!;
    const ts = h.now();
    row.status = "issued";
    row.issuedAt = ts;
    row.updatedAt = ts;

    for (const line of row.lines) {
      if (!line.itemId) continue;
      store.stockMoves.push({
        id: h.id(),
        date: row.date,
        itemId: line.itemId,
        warehouseId: row.warehouseId,
        qtyDelta: -line.qty,
        type: "sale",
        refType: "sales_invoice",
        refId: row.id,
        unitCost: store.items.find((i) => i.id === line.itemId)?.cost ?? 0,
        note: row.number,
        createdAt: ts,
        updatedAt: ts,
      });
    }
  });

  await syncStatus(id);
  refresh(id);
  return ok(undefined);
}

/**
 * Cancel an issued invoice. The original sale moves stay on the ledger and are
 * cancelled by opposing "return" moves — an audit trail is only useful if it
 * cannot be rewritten.
 */
export async function voidInvoice(id: string): Promise<Result> {
  const db = await snapshot();
  const invoice = db.salesInvoices.find((i) => i.id === id);
  if (!invoice) return fail("msg.error", "not-found");
  if (invoice.status === "void") return fail("msg.error", "already-void");
  if (invoice.status === "draft") return fail("msg.error", "not-issued");
  if (paidForInvoice(db.payments, id) > 0) return fail("msg.error", "has-payments");

  await transaction((store, h) => {
    const row = store.salesInvoices.find((i) => i.id === id)!;
    const ts = h.now();
    const today = new Date().toISOString().slice(0, 10);

    for (const move of store.stockMoves.filter(
      (m) => m.refType === "sales_invoice" && m.refId === id && m.type === "sale",
    )) {
      store.stockMoves.push({
        ...move,
        id: h.id(),
        date: today,
        qtyDelta: -move.qtyDelta,
        type: "return",
        note: `إلغاء ${row.number}`,
        createdAt: ts,
        updatedAt: ts,
      });
    }

    row.status = "void";
    row.updatedAt = ts;
  });

  refresh(id);
  return ok(undefined);
}

export async function deleteInvoice(id: string): Promise<Result> {
  const db = await snapshot();
  const invoice = db.salesInvoices.find((i) => i.id === id);
  if (!invoice) return fail("msg.error", "not-found");
  if (invoice.status !== "draft") return fail("msg.error", "not-a-draft");
  await remove("salesInvoices", id);
  refresh();
  return ok(undefined);
}

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

/** Record money received, then let the invoice status follow from it. */
export async function recordInvoicePayment(input: {
  invoiceId: string;
  date: string;
  amount: number;
  method: "cash" | "bank" | "cheque" | "card";
  reference: string;
  note: string;
}): Promise<Result> {
  if (input.amount <= 0) return fail("msg.requiredField");

  const db = await snapshot();
  const invoice = db.salesInvoices.find((i) => i.id === input.invoiceId);
  if (!invoice) return fail("msg.error", "not-found");
  if (invoice.status === "draft" || invoice.status === "void") {
    return fail("msg.error", "not-issued");
  }

  await create("payments", {
    date: input.date,
    direction: "in",
    partyType: "customer",
    partyId: invoice.customerId,
    invoiceId: invoice.id,
    // Payments are taken in the currency the invoice was raised in, at the
    // rate frozen on that invoice — so the balance closes exactly.
    amount: round2(input.amount),
    currency: invoice.currency,
    fxRate: invoice.fxRate,
    method: input.method,
    reference: input.reference,
    note: input.note,
  });

  await syncStatus(invoice.id);
  refresh(invoice.id);
  return ok(undefined);
}
