import type { ISODate } from "./data/types";

/**
 * Intl sprinkles bidi control marks (LRM / RLM / ALM) into Arabic date output.
 * Inside an RTL page those reorder a dd/mm/yyyy string into nonsense such as
 * "012025/12/". We isolate numbers ourselves through the `.num` class, so the
 * marks are redundant here — strip them.
 */
const BIDI_MARKS = /[‎‏؜]/g;

function stripBidi(value: string): string {
  return value.replace(BIDI_MARKS, "");
}

export function today(): ISODate {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: ISODate, to: ISODate): number {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

/** Days a date is past due relative to today. Negative means not yet due. */
export function daysOverdue(due: ISODate): number {
  return daysBetween(due, today());
}

export function startOfMonth(date: ISODate = today()): ISODate {
  return date.slice(0, 7) + "-01";
}

/** The first day of each of the last `n` months, oldest first. */
export function lastMonths(n: number, from: ISODate = today()): ISODate[] {
  const out: ISODate[] = [];
  const d = new Date(startOfMonth(from) + "T00:00:00Z");
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d);
    m.setUTCMonth(m.getUTCMonth() - i);
    out.push(m.toISOString().slice(0, 10));
  }
  return out;
}

export function isInMonth(date: ISODate, monthStart: ISODate): boolean {
  return date.slice(0, 7) === monthStart.slice(0, 7);
}

/**
 * Gregorian calendar with Latin digits, even in Arabic. The business runs on
 * Gregorian dates, and tables align better without Arabic-Indic numerals.
 */
export function formatDate(date: ISODate | null | undefined, locale = "ar"): string {
  if (!date) return "—";
  return stripBidi(
    new Intl.DateTimeFormat(`${locale}-u-ca-gregory-nu-latn`, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(date + "T00:00:00")),
  );
}

export function formatMonth(date: ISODate, locale = "ar"): string {
  return stripBidi(
    new Intl.DateTimeFormat(`${locale}-u-ca-gregory-nu-latn`, {
      month: "short",
      year: "2-digit",
    }).format(new Date(date + "T00:00:00")),
  );
}

export function formatDateTime(ts: string | null | undefined, locale = "ar"): string {
  if (!ts) return "—";
  return stripBidi(
    new Intl.DateTimeFormat(`${locale}-u-ca-gregory-nu-latn`, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(ts)),
  );
}
