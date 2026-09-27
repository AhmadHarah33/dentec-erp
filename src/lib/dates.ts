import type { ISODate } from "./data/types";

/**
 * Intl sprinkles bidi control marks (LRM / RLM / ALM) into Arabic date output.
 * Inside an RTL page those reorder a dd/mm/yyyy string into nonsense such as
 * "012025/12/". We isolate numbers ourselves through the `.num` class, so the
 * marks are redundant here — strip them.
 */
const BIDI_MARKS = /[‎‏؜]/g;

export function stripBidi(value: string): string {
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

/**
 * The business clock. Timestamps are stored in UTC; they are shown in the
 * company's own zone so the server render and the browser render agree —
 * formatting in "whatever zone this machine is in" put UTC in the HTML and
 * local time in the hydrated page, which React rejects as a mismatch.
 */
export const APP_TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || "Europe/Istanbul";

/**
 * Assembled from numeric parts rather than taken whole from Intl: Node and the
 * browser ship different ICU builds and disagree on separators (a comma here,
 * none there), which is another hydration mismatch. Digits they agree on.
 */
export function formatDateTime(ts: string | null | undefined, _locale = "ar"): string {
  if (!ts) return "—";
  const parts = new Intl.DateTimeFormat("en-GB-u-nu-latn", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ts));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}
