/**
 * Derived figures shared by the dashboard, the party pages and the reports.
 * Kept in one place so "receivables" means the same number everywhere.
 */

import type {
  Database,
  Expense,
  ID,
  Item,
  Payment,
  PurchaseOrder,
  SalesInvoice,
  ServiceJob,
} from "./data/types";
import { computeTotals, round2, toBase } from "./money";
import { daysOverdue, isInMonth, lastMonths, today } from "./dates";

/** Invoices that represent money owed. Drafts are not yet real; voids never were. */
export function isLive(inv: SalesInvoice): boolean {
  return inv.status !== "draft" && inv.status !== "void";
}

/** An invoice total, in base currency, at the rate frozen on the document. */
export function invoiceTotalBase(inv: SalesInvoice): number {
  const t = computeTotals(inv.lines, inv.discountKind, inv.discountValue);
  return toBase(t.total, inv.fxRate);
}

export function purchaseTotalBase(po: PurchaseOrder): number {
  const t = computeTotals(po.lines, po.discountKind, po.discountValue);
  return toBase(t.total, po.fxRate);
}

export function paymentBase(p: Payment): number {
  return toBase(p.amount, p.fxRate);
}

export function expenseBase(e: Expense): number {
  return toBase(e.amount, e.fxRate);
}

/* ------------------------------------------------------------------ */
/* Balances                                                            */
/* ------------------------------------------------------------------ */

/** Amount settled against one invoice, in base currency. */
export function paidForInvoice(payments: Payment[], invoiceId: ID): number {
  return round2(
    payments
      .filter((p) => p.invoiceId === invoiceId && p.direction === "in")
      .reduce((s, p) => s + paymentBase(p), 0),
  );
}

export function invoiceOutstanding(inv: SalesInvoice, payments: Payment[]): number {
  if (!isLive(inv)) return 0;
  return round2(Math.max(invoiceTotalBase(inv) - paidForInvoice(payments, inv.id), 0));
}

/**
 * What a customer owes: every live invoice, less every payment received from
 * them. Payments not tied to a specific invoice still count against the total,
 * which is how an advance or an on-account settlement behaves.
 */
export function customerBalance(
  customerId: ID,
  invoices: SalesInvoice[],
  payments: Payment[],
): number {
  const billed = invoices
    .filter((i) => i.customerId === customerId && isLive(i))
    .reduce((s, i) => s + invoiceTotalBase(i), 0);
  const received = payments
    .filter((p) => p.partyType === "customer" && p.partyId === customerId && p.direction === "in")
    .reduce((s, p) => s + paymentBase(p), 0);
  return round2(billed - received);
}

export function supplierBalance(
  supplierId: ID,
  orders: PurchaseOrder[],
  payments: Payment[],
): number {
  const billed = orders
    .filter(
      (o) => o.supplierId === supplierId && o.status !== "draft" && o.status !== "cancelled",
    )
    .reduce((s, o) => s + purchaseTotalBase(o), 0);
  const sent = payments
    .filter((p) => p.partyType === "supplier" && p.partyId === supplierId && p.direction === "out")
    .reduce((s, p) => s + paymentBase(p), 0);
  return round2(billed - sent);
}

export function totalReceivables(db: Database): number {
  return round2(
    db.salesInvoices.reduce((s, i) => s + invoiceOutstanding(i, db.payments), 0),
  );
}

export function totalPayables(db: Database): number {
  return round2(
    db.suppliers.reduce(
      (s, sup) => s + Math.max(supplierBalance(sup.id, db.purchaseOrders, db.payments), 0),
      0,
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Aging                                                               */
/* ------------------------------------------------------------------ */

export type AgingBucket = "current" | "d30" | "d60" | "d90" | "d90plus";

export const AGING_BUCKETS: AgingBucket[] = ["current", "d30", "d60", "d90", "d90plus"];

export function bucketFor(dueDate: string): AgingBucket {
  const overdue = daysOverdue(dueDate);
  if (overdue <= 0) return "current";
  if (overdue <= 30) return "d30";
  if (overdue <= 60) return "d60";
  if (overdue <= 90) return "d90";
  return "d90plus";
}

export interface AgingRow {
  partyId: ID;
  name: string;
  buckets: Record<AgingBucket, number>;
  total: number;
}

export function agingByCustomer(db: Database): AgingRow[] {
  const map = new Map<ID, AgingRow>();

  for (const inv of db.salesInvoices) {
    const outstanding = invoiceOutstanding(inv, db.payments);
    if (outstanding <= 0.005) continue;

    let row = map.get(inv.customerId);
    if (!row) {
      const customer = db.customers.find((c) => c.id === inv.customerId);
      row = {
        partyId: inv.customerId,
        name: customer?.name ?? "—",
        buckets: { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 },
        total: 0,
      };
      map.set(inv.customerId, row);
    }
    row.buckets[bucketFor(inv.dueDate)] += outstanding;
    row.total += outstanding;
  }

  for (const row of map.values()) {
    row.total = round2(row.total);
    for (const b of AGING_BUCKETS) row.buckets[b] = round2(row.buckets[b]);
  }

  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function overdueInvoices(db: Database): SalesInvoice[] {
  const t = today();
  return db.salesInvoices
    .filter((i) => isLive(i) && i.dueDate < t && invoiceOutstanding(i, db.payments) > 0.005)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
}

/* ------------------------------------------------------------------ */
/* Sales analysis                                                      */
/* ------------------------------------------------------------------ */

export interface MonthPoint {
  month: string; // ISO first-of-month
  sales: number;
  count: number;
}

export function salesByMonth(invoices: SalesInvoice[], months = 12): MonthPoint[] {
  const live = invoices.filter(isLive);
  return lastMonths(months).map((month) => {
    const inMonth = live.filter((i) => isInMonth(i.date, month));
    return {
      month,
      sales: round2(inMonth.reduce((s, i) => s + invoiceTotalBase(i), 0)),
      count: inMonth.length,
    };
  });
}

export interface ItemSales {
  itemId: ID;
  item: Item | undefined;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
}

/** Revenue per item, net of line discounts, excluding tax. */
export function salesByItem(db: Database, from?: string, to?: string): ItemSales[] {
  const map = new Map<ID, ItemSales>();

  for (const inv of db.salesInvoices) {
    if (!isLive(inv)) continue;
    if (from && inv.date < from) continue;
    if (to && inv.date > to) continue;

    const totals = computeTotals(inv.lines, inv.discountKind, inv.discountValue);
    inv.lines.forEach((line, idx) => {
      if (!line.itemId) return;
      const item = db.items.find((i) => i.id === line.itemId);
      let row = map.get(line.itemId);
      if (!row) {
        row = { itemId: line.itemId, item, units: 0, revenue: 0, cost: 0, profit: 0 };
        map.set(line.itemId, row);
      }
      row.units += line.qty;
      row.revenue += toBase(totals.lines[idx].taxable, inv.fxRate);
      row.cost += (item?.cost ?? 0) * line.qty;
    });
  }

  for (const row of map.values()) {
    row.revenue = round2(row.revenue);
    row.cost = round2(row.cost);
    row.profit = round2(row.revenue - row.cost);
  }

  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

export interface CustomerSales {
  customerId: ID;
  name: string;
  invoices: number;
  revenue: number;
}

export function salesByCustomer(db: Database, from?: string, to?: string): CustomerSales[] {
  const map = new Map<ID, CustomerSales>();

  for (const inv of db.salesInvoices) {
    if (!isLive(inv)) continue;
    if (from && inv.date < from) continue;
    if (to && inv.date > to) continue;

    let row = map.get(inv.customerId);
    if (!row) {
      row = {
        customerId: inv.customerId,
        name: db.customers.find((c) => c.id === inv.customerId)?.name ?? "—",
        invoices: 0,
        revenue: 0,
      };
      map.set(inv.customerId, row);
    }
    row.invoices += 1;
    row.revenue += invoiceTotalBase(inv);
  }

  for (const row of map.values()) row.revenue = round2(row.revenue);
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

export function openServiceJobs(jobs: ServiceJob[]): ServiceJob[] {
  return jobs
    .filter((j) => j.status !== "delivered")
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
