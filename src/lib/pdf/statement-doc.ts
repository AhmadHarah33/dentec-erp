/**
 * Loading a customer statement for the print route and the PDF route, which
 * must agree on both the figures and how the date range is read.
 */

import { snapshot } from "@/lib/data/repository";
import type { Customer, ISODate, Settings } from "@/lib/data/types";
import { today } from "@/lib/dates";
import { buildStatement, type Statement } from "@/lib/statement";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A date from the query string, or null when absent or malformed. */
export function readDate(v: string | null | undefined): ISODate | null {
  return v && ISO.test(v) ? v : null;
}

export async function loadStatement(
  customerId: string,
  from: string | null | undefined,
  to: string | null | undefined,
): Promise<{ customer: Customer; statement: Statement; settings: Settings } | null> {
  const db = await snapshot();
  const customer = db.customers.find((c) => c.id === customerId);
  if (!customer) return null;
  const statement = buildStatement(db, customerId, readDate(from), readDate(to) ?? today());
  return { customer, statement, settings: db.settings };
}

export function statementFilename(customer: Customer, statement: Statement): string {
  return `statement-${customer.code || customer.id.slice(0, 8)}-${statement.to}.pdf`;
}
