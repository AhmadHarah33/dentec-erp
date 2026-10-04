"use server";

import { revalidatePath } from "next/cache";
import { transaction } from "@/lib/data/repository";
import type { BillingRegion, DispatchInfo, DocumentLine, InvoiceDocumentType, SalesInvoice } from "@/lib/data/types";
import { needsDispatch, normalisePlate } from "@/lib/billing/region";
import { buildStockIndex, onHand } from "@/lib/stock";
import { computeTotals, round2, toBase } from "@/lib/money";
import { paidForInvoice } from "@/lib/queries";
import { addMonths } from "@/lib/dates";
import { fail, ok, STOCK_PATHS, type Result } from "./shared";
import { syncStatus } from "@/lib/invoice-status";
import { guard } from "@/lib/auth/server";
import {
  billingInput,
  documentRefsExist,
  invoiceInput,
  invoicePaymentInput,
  serialsInput,
} from "@/lib/inputs";
import { parse } from "@/lib/validate";

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
  const gate = await guard("invoices", "limited");
  if (!gate.ok) return gate;
  // Only the fields a person may set are read from `input`. Status, number
  // and issue date belong to the server: a draft cannot be saved as "paid".
  const parsed = parse(() => invoiceInput(input));
  if (!parsed.ok) return parsed;
  const data = parsed.data;
  const valid = validate(data.lines);
  if (!valid.ok) return valid;
  if (!data.customerId) return fail("msg.requiredField");

  // One transaction: the draft check and the write cannot be separated by an
  // issue happening in between.
  const outcome = await transaction((db, h): Result<string> => {
    if (!documentRefsExist(db, data, db.customers, data.customerId)) return fail("msg.error", "unknown-reference");
    const ts = h.now();

    if (id) {
      const row = db.salesInvoices.find((i) => i.id === id);
      if (!row) return fail("msg.error", "not-found");
      // An issued invoice has already moved stock and may have payments against
      // it; editing the lines would silently desynchronise both.
      if (row.status !== "draft") return fail("msg.error", "not-a-draft");
      Object.assign(row, data, { updatedAt: ts });
      return ok(row.id);
    }

    const row: SalesInvoice = {
      ...data,
      id: h.id(),
      number: nextNumber(
        db.salesInvoices.map((i) => i.number),
        db.settings.invoicePrefix,
      ),
      status: "draft",
      issuedAt: null,
      createdAt: ts,
      updatedAt: ts,
    };
    db.salesInvoices.push(row);
    return ok(row.id);
  });

  if (outcome.ok) refresh(outcome.data);
  return outcome;
}

/**
 * Set the regime and document type on one invoice.
 *
 * Kept apart from `saveInvoice` on purpose: the lines of an issued invoice are
 * frozen, but which GİB document it is filed as can still need correcting —
 * a buyer joins the e-Fatura user list, or a shipment turns out to need an
 * e-İrsaliye. This is the one thing editable after issue.
 */
export async function setInvoiceBilling(
  id: string,
  input: {
    billingRegion: BillingRegion;
    documentType: InvoiceDocumentType;
    dispatch?: DispatchInfo;
    localCurrency?: SalesInvoice["localCurrency"];
    localRate?: number;
  },
): Promise<Result> {
  const gate = await guard("invoices", "limited");
  if (!gate.ok) return gate;
  const parsed = parse(() => billingInput(input));
  if (!parsed.ok) return parsed;
  const data = parsed.data;

  // A dispatch note without a plate and a driver is not a dispatch note; the
  // integrator would reject it, so it is refused here instead.
  if (needsDispatch(data.documentType)) {
    const d = data.dispatch;
    if (!d?.vehiclePlate?.trim() || !d?.driverName?.trim()) {
      return fail("compliance.missingDispatch");
    }
  }
  const dispatch = data.dispatch
    ? { ...data.dispatch, vehiclePlate: normalisePlate(data.dispatch.vehiclePlate) }
    : undefined;

  const outcome = await transaction((db, h): Result => {
    const invoice = db.salesInvoices.find((i) => i.id === id);
    if (!invoice) return fail("msg.error", "not-found");
    if (invoice.status === "void") return fail("msg.error", "void");
    invoice.billingRegion = data.billingRegion;
    invoice.documentType = data.documentType;
    invoice.dispatch = dispatch;
    invoice.localCurrency = data.localCurrency;
    invoice.localRate = data.localRate;
    invoice.updatedAt = h.now();
    return ok(undefined);
  });
  if (!outcome.ok) return outcome;

  refresh(id);
  return ok(undefined);
}

/**
 * Move the invoice out of draft and take the goods off the shelf.
 *
 * Every check — still a draft, serials, stock on hand — runs inside the same
 * transaction as the writes, under the write lock. Checking beforehand and
 * writing afterwards let a double click issue one invoice twice, and two
 * people issuing the last unit both succeed.
 *
 * `serials` maps a line id to the serial numbers of the units on it. Lines of
 * serial-tracked items need exactly one serial per unit sold; each becomes a
 * `units` record carrying the customer, the invoice and the warranty end.
 */
export async function issueInvoice(
  id: string,
  serials: Record<string, string[]> = {},
): Promise<Result> {
  const gate = await guard("invoices", "limited");
  if (!gate.ok) return gate;
  const parsed = parse(() => serialsInput(serials));
  if (!parsed.ok) return parsed;
  const given = parsed.data;

  const outcome = await transaction((store, h): Result => {
    const row = store.salesInvoices.find((i) => i.id === id);
    if (!row) return fail("msg.error", "not-found");
    if (row.status !== "draft") return fail("msg.error", "not-a-draft");

    // Serials first: a missing one should stop the issue before anything moves.
    const entered = new Map<string, string[]>();
    for (const line of row.lines) {
      const item = line.itemId ? store.items.find((i) => i.id === line.itemId) : undefined;
      if (!item?.tracksSerial) continue;
      if (!Number.isInteger(line.qty)) return fail("serial.qtyWhole", item.nameAr);
      const list = (given[line.id] ?? []).map((s) => s.trim()).filter(Boolean);
      if (list.length !== line.qty) return fail("serial.count", item.nameAr);
      entered.set(line.id, list);
    }
    const seen = new Set<string>();
    for (const line of row.lines) {
      for (const s of entered.get(line.id) ?? []) {
        const key = `${line.itemId}|${s.toLowerCase()}`;
        if (seen.has(key)) return fail("serial.duplicate", s);
        seen.add(key);
        // Sold already, to this or anyone else.
        if (store.units.some((u) => u.itemId === line.itemId && u.serialNo.toLowerCase() === s.toLowerCase())) {
          return fail("serial.duplicate", s);
        }
      }
    }

    const index = buildStockIndex(store.stockMoves);
    const needed = new Map<string, number>();
    for (const line of row.lines) {
      if (!line.itemId) continue;
      needed.set(line.itemId, (needed.get(line.itemId) ?? 0) + line.qty);
    }
    for (const [itemId, qty] of needed) {
      if (onHand(index, itemId, row.warehouseId) < qty) {
        const item = store.items.find((i) => i.id === itemId);
        return fail("msg.insufficientStock", item?.nameAr ?? itemId);
      }
    }

    const ts = h.now();
    row.status = "issued";
    row.issuedAt = ts;
    row.updatedAt = ts;

    for (const line of row.lines) {
      const list = entered.get(line.id);
      if (!list || !line.itemId) continue;
      line.serials = list;
      const months = store.items.find((i) => i.id === line.itemId)?.warrantyMonths ?? 0;
      for (const serialNo of list) {
        store.units.push({
          id: h.id(),
          itemId: line.itemId,
          serialNo,
          customerId: row.customerId,
          invoiceId: row.id,
          soldAt: row.date,
          warrantyEnd: months > 0 ? addMonths(row.date, months) : null,
          notes: "",
          createdAt: ts,
          updatedAt: ts,
        });
      }
    }

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
        note: row.number,
        unitCost: store.items.find((i) => i.id === line.itemId)?.cost ?? 0,
        createdAt: ts,
        updatedAt: ts,
      });
    }
    return ok(undefined);
  });
  if (!outcome.ok) return outcome;

  await syncStatus(id);
  refresh(id);
  return ok(undefined);
}

/**
 * Cancel an issued invoice. The original sale moves stay on the ledger and are
 * cancelled by opposing "return" moves — an audit trail is only useful if it
 * cannot be rewritten.
 *
 * The status and payment checks are inside the transaction: run beforehand,
 * two clicks both passed them and the stock was returned twice.
 */
export async function voidInvoice(id: string): Promise<Result> {
  const gate = await guard("invoices", "edit");
  if (!gate.ok) return gate;

  const outcome = await transaction((store, h): Result => {
    const row = store.salesInvoices.find((i) => i.id === id);
    if (!row) return fail("msg.error", "not-found");
    if (row.status === "void") return fail("msg.error", "already-void");
    if (row.status === "draft") return fail("msg.error", "not-issued");
    if (paidForInvoice(store.payments, id) > 0) return fail("msg.error", "has-payments");

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

    // The machines are no longer sold: drop their records so the serials can
    // be sold again. Service jobs that pointed at them keep the typed serial.
    store.units = store.units.filter((u) => u.invoiceId !== id);

    row.status = "void";
    row.updatedAt = ts;
    return ok(undefined);
  });
  if (!outcome.ok) return outcome;

  refresh(id);
  return ok(undefined);
}

export async function deleteInvoice(id: string): Promise<Result> {
  const gate = await guard("invoices", "limited");
  if (!gate.ok) return gate;

  const outcome = await transaction((db): Result => {
    const index = db.salesInvoices.findIndex((i) => i.id === id);
    if (index === -1) return fail("msg.error", "not-found");
    if (db.salesInvoices[index].status !== "draft") return fail("msg.error", "not-a-draft");
    db.salesInvoices.splice(index, 1);
    return ok(undefined);
  });
  if (!outcome.ok) return outcome;

  refresh();
  return ok(undefined);
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
  const gate = await guard("finance", "edit");
  if (!gate.ok) return gate;
  const parsed = parse(() => invoicePaymentInput(input));
  if (!parsed.ok) return parsed;
  const data = parsed.data;
  if (data.amount <= 0) return fail("msg.requiredField");

  const outcome = await transaction((db, h): Result => {
    const invoice = db.salesInvoices.find((i) => i.id === data.invoiceId);
    if (!invoice) return fail("msg.error", "not-found");
    if (invoice.status === "draft" || invoice.status === "void") {
      return fail("msg.error", "not-issued");
    }
    const ts = h.now();
    db.payments.push({
      id: h.id(),
      date: data.date,
      direction: "in",
      partyType: "customer",
      partyId: invoice.customerId,
      invoiceId: invoice.id,
      // Payments are taken in the currency the invoice was raised in, at the
      // rate frozen on that invoice — so the balance closes exactly.
      amount: round2(data.amount),
      currency: invoice.currency,
      fxRate: invoice.fxRate,
      method: data.method,
      reference: data.reference,
      note: data.note,
      createdAt: ts,
      updatedAt: ts,
    });
    return ok(undefined);
  });
  if (!outcome.ok) return outcome;

  await syncStatus(data.invoiceId);
  refresh(data.invoiceId);
  return ok(undefined);
}
