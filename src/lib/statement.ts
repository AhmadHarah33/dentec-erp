/**
 * A customer statement: every live invoice (debit) and payment received
 * (credit) in date order, with a running balance. All in the base currency at
 * the rates frozen on each document, so the closing figure always equals what
 * `customerBalance()` shows on the customer's page.
 */

import type { Database, ID, ISODate, PaymentMethod } from "./data/types";
import { invoiceTotalBase, isLive, paymentBase } from "./queries";
import { round2 } from "./money";

export interface StatementRow {
  date: ISODate;
  kind: "invoice" | "payment";
  /** Invoice number, or payment reference. */
  ref: string;
  method?: PaymentMethod;
  debit: number;
  credit: number;
  balance: number;
}

export interface Statement {
  from: ISODate | null;
  to: ISODate;
  /** What the customer owed at the start of the period. */
  opening: number;
  rows: StatementRow[];
  totalDebit: number;
  totalCredit: number;
  closing: number;
}

export function buildStatement(
  db: Database,
  customerId: ID,
  from: ISODate | null,
  to: ISODate,
): Statement {
  type Entry = Omit<StatementRow, "balance"> & { order: number };

  const entries: Entry[] = [];
  for (const inv of db.salesInvoices) {
    if (inv.customerId !== customerId || !isLive(inv)) continue;
    entries.push({ date: inv.date, kind: "invoice", ref: inv.number, debit: invoiceTotalBase(inv), credit: 0, order: 0 });
  }
  for (const p of db.payments) {
    if (p.partyType !== "customer" || p.partyId !== customerId || p.direction !== "in") continue;
    entries.push({ date: p.date, kind: "payment", ref: p.reference, method: p.method, debit: 0, credit: paymentBase(p), order: 1 });
  }
  // Same day: the invoice first, so a same-day payment never shows a negative balance.
  entries.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1));

  let opening = 0;
  const inPeriod: Entry[] = [];
  for (const e of entries) {
    if (e.date > to) continue;
    if (from && e.date < from) opening += e.debit - e.credit;
    else inPeriod.push(e);
  }
  opening = round2(opening);

  let balance = opening;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows: StatementRow[] = inPeriod.map(({ order: _order, ...e }) => {
    balance = round2(balance + e.debit - e.credit);
    totalDebit += e.debit;
    totalCredit += e.credit;
    return { ...e, debit: round2(e.debit), credit: round2(e.credit), balance };
  });

  return { from, to, opening, rows, totalDebit: round2(totalDebit), totalCredit: round2(totalCredit), closing: balance };
}
