/**
 * The Syrian side: a commercial export invoice (فاتورة تصدير / بيع تجاري).
 *
 * There is no e-transformation to satisfy here and no payload to hand an
 * integrator — the document *is* the deliverable, and what it has to get
 * right is the money. Goods leaving Türkiye for Syria are exported, so KDV is
 * zero-rated at origin, the price is quoted in hard currency, and the buyer
 * and the customs post both want to see the figure restated in a second
 * currency at a stated rate.
 *
 * Hence: one primary currency (USD or EUR), an optional secondary conversion,
 * and the exemption wording printed rather than implied.
 */

import type {
  Customer,
  CurrencyCode,
  SalesInvoice,
  Settings,
} from "../data/types";
import { computeTotals, formatMoney, round2, type DocumentTotals } from "../money";

/** What Dentec actually invoices Syrian customers in. */
export const EXPORT_CURRENCIES: CurrencyCode[] = ["USD", "EUR"];

/** Currencies the total may be *restated* in, alongside the primary one. */
export const CONVERSION_CURRENCIES: CurrencyCode[] = ["TRY", "SYP", "USD", "EUR"];

export function isExportCurrency(code: CurrencyCode): boolean {
  return EXPORT_CURRENCIES.includes(code);
}

/**
 * Export sales are zero-rated, so an SY document should carry 0 % on every
 * line. A non-zero rate is nearly always a line copied from a domestic quote.
 */
export function nonZeroRatedLines(invoice: SalesInvoice): string[] {
  return invoice.lines.filter((l) => (l.taxRate || 0) !== 0).map((l) => l.id);
}

export interface CurrencyRestatement {
  currency: CurrencyCode;
  rate: number;
  total: number;
  formatted: string;
}

/**
 * The "and in words / and in local money" line at the foot of an export
 * invoice. Returns `null` when no secondary currency was set, so the caller
 * can simply omit the row rather than print a converted zero.
 */
export function restateTotal(
  invoice: SalesInvoice,
  totals: DocumentTotals,
  locale = "ar",
): CurrencyRestatement | null {
  const currency = invoice.localCurrency;
  const rate = invoice.localRate;
  if (!currency || !rate || rate <= 0) return null;
  if (currency === invoice.currency) return null;

  const total = round2(totals.total * rate);
  return {
    currency,
    rate,
    total,
    formatted: formatMoney(total, currency, locale),
  };
}

/**
 * The customs / transit wording. The customer's own note wins when they have
 * one on file — different buyers clear through different posts and their
 * brokers each want their own phrasing — otherwise the standard zero-rating
 * sentence is used.
 */
export function exemptionNote(
  customer: Customer | undefined,
  locale = "ar",
): string {
  const custom = customer?.syria?.exemptionNote?.trim();
  if (custom) return custom;
  return locale === "tr"
    ? "İhracat teslimi — KDV Kanunu md. 11/1-a uyarınca KDV'den istisnadır."
    : "توريد تصديري — معفى من ضريبة القيمة المضافة وفق المادة ١١/١-أ من قانون الضريبة.";
}

export interface ExportDocumentView {
  totals: DocumentTotals;
  restated: CurrencyRestatement | null;
  exemptionNote: string;
  customsOffice: string;
  commercialRegisterNo: string;
  importLicenseNo: string;
  /** True when a line carries VAT it should not — surfaced as a warning. */
  hasTaxedLines: boolean;
  /** Origin, which a customs post always asks for. */
  countryOfOrigin: string;
}

/**
 * Everything the SY document needs, resolved once. The PDF renderer and the
 * on-screen detail view both read this, so the paper copy and the screen can
 * never disagree about the rate or the exemption wording.
 */
export function buildExportView(
  invoice: SalesInvoice,
  customer: Customer | undefined,
  settings: Settings,
  locale = "ar",
): ExportDocumentView {
  const totals = computeTotals(
    invoice.lines,
    invoice.discountKind,
    invoice.discountValue,
  );
  void settings;

  return {
    totals,
    restated: restateTotal(invoice, totals, locale),
    exemptionNote: exemptionNote(customer, locale),
    customsOffice: customer?.syria?.customsOffice ?? "",
    commercialRegisterNo: customer?.syria?.commercialRegisterNo ?? "",
    importLicenseNo: customer?.syria?.importLicenseNo ?? "",
    hasTaxedLines: nonZeroRatedLines(invoice).length > 0,
    countryOfOrigin: locale === "tr" ? "Türkiye" : "تركيا",
  };
}
