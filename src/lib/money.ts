/**
 * The only place money math lives. Every total, tax figure and currency
 * conversion in the app comes from here, so a rounding decision is made once.
 */

import type {
  CurrencyCode,
  DiscountKind,
  DocumentLine,
  Settings,
} from "./data/types";

/** Round to 2dp without the float drift of `Math.round(x * 100) / 100`. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface DocumentTotals {
  /** Sum of line amounts after per-line discounts, before the document discount. */
  subtotal: number;
  /** The document-level discount, resolved to an absolute amount. */
  discount: number;
  /** Taxable base: subtotal minus the document discount. */
  net: number;
  tax: number;
  total: number;
  lines: LineTotals[];
}

export interface LineTotals {
  id: string;
  /** qty × price, before any discount. */
  gross: number;
  /** After the per-line discount. */
  net: number;
  /** After this line takes its share of the document discount. */
  taxable: number;
  tax: number;
  total: number;
}

/**
 * Compute a document's totals.
 *
 * The document-level discount is spread across lines in proportion to their
 * value before tax is applied. This matters because lines can carry different
 * VAT rates — discounting the total and then taxing it would quietly move
 * money between tax bands.
 */
export function computeTotals(
  lines: DocumentLine[],
  discountKind: DiscountKind,
  discountValue: number,
): DocumentTotals {
  const nets = lines.map((l) => {
    const gross = l.qty * l.unitPrice;
    const net = gross * (1 - (l.discountPercent || 0) / 100);
    return { line: l, gross, net };
  });

  const subtotal = nets.reduce((s, n) => s + n.net, 0);

  let discount =
    discountKind === "percent"
      ? subtotal * ((discountValue || 0) / 100)
      : discountValue || 0;
  // A discount can never exceed the subtotal, however it was entered.
  discount = Math.min(Math.max(discount, 0), subtotal);

  const factor = subtotal > 0 ? (subtotal - discount) / subtotal : 0;

  const lineTotals: LineTotals[] = nets.map(({ line, gross, net }) => {
    const taxable = net * factor;
    const tax = taxable * ((line.taxRate || 0) / 100);
    return {
      id: line.id,
      gross: round2(gross),
      net: round2(net),
      taxable: round2(taxable),
      tax: round2(tax),
      total: round2(taxable + tax),
    };
  });

  const tax = round2(lineTotals.reduce((s, l) => s + l.tax, 0));
  const net = round2(subtotal - discount);

  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    net,
    tax,
    total: round2(net + tax),
    lines: lineTotals,
  };
}

/* ------------------------------------------------------------------ */
/* Currency                                                            */
/* ------------------------------------------------------------------ */

/** Convert a document amount into base currency using its frozen rate. */
export function toBase(amount: number, fxRate: number): number {
  return round2(amount * (fxRate || 1));
}

export function rateFor(settings: Settings, code: CurrencyCode): number {
  if (code === settings.baseCurrency) return 1;
  return settings.currencies.find((c) => c.code === code)?.rate ?? 1;
}

const CURRENCY_DECIMALS: Partial<Record<CurrencyCode, number>> = {
  SYP: 0,
};

/**
 * Format money for display. Digits are kept Latin (`-u-nu-latn`) even in
 * Arabic: the whole app aligns numbers in tabular columns, and mixing
 * Arabic-Indic digits into that breaks the alignment users rely on when
 * scanning a price list.
 */
export function formatMoney(
  amount: number,
  currency: CurrencyCode,
  locale = "ar",
): string {
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  return new Intl.NumberFormat(`${locale}-u-nu-latn`, {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount || 0);
}

/**
 * Money for a KPI tile: 556,833.00 US$ becomes 556.8K US$.
 *
 * Only for figures that are being scanned, never for figures that are being
 * checked — tables, documents and reports always use `formatMoney`, because a
 * rounded total on an invoice is a wrong total.
 */
export function formatMoneyCompact(
  amount: number,
  currency: CurrencyCode,
  locale = "ar",
): string {
  const n = amount || 0;
  // Below 10,000 the full figure is short enough to read, and compacting it
  // loses precision for no gain in width.
  if (Math.abs(n) < 10_000) return formatMoney(n, currency, locale);
  return new Intl.NumberFormat(`${locale}-u-nu-latn`, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

/** A bare compact figure — for chart axis ticks, where the currency is implied. */
export function formatNumberCompact(n: number, locale = "ar"): string {
  return new Intl.NumberFormat(`${locale}-u-nu-latn`, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n || 0);
}

export function formatNumber(n: number, locale = "ar", decimals = 2): string {
  return new Intl.NumberFormat(`${locale}-u-nu-latn`, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(n || 0);
}
