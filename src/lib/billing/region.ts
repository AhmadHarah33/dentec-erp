/**
 * Which billing regime a document belongs to, and what that regime demands.
 *
 * Everything here is pure and synchronous so a server page, a Server Action
 * and the PDF renderer can all reach the same verdict about one invoice
 * without any of them re-deriving the rules.
 */

import type {
  BillingRegion,
  Customer,
  DispatchInfo,
  InvoiceDocumentType,
  KdvRate,
  SalesInvoice,
  TurkeyTaxProfile,
  TurkishTaxIdKind,
} from "../data/types";
import { KDV_RATES } from "../data/types";

/**
 * Dentec is a Turkish company, so an unmarked party is a domestic one. This
 * is the single place that assumption is made — every legacy row without a
 * `billingRegion` flows through here.
 */
export const DEFAULT_REGION: BillingRegion = "TR";

export function resolveRegion(
  row: { billingRegion?: BillingRegion } | null | undefined,
): BillingRegion {
  return row?.billingRegion ?? DEFAULT_REGION;
}

/* ------------------------------------------------------------------ */
/* Turkish identifiers                                                 */
/* ------------------------------------------------------------------ */

/**
 * The tenth VKN digit, derived from the first nine.
 *
 * Positions are 1-based in the GİB's description and the offset is
 * `10 - position`, so the leftmost digit is offset by 9, not by 10 — the one
 * place this is easy to get wrong, and getting it wrong still produces a
 * plausible-looking number that every real system rejects.
 */
export function vknCheckDigit(first9: string): number {
  const d = first9.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const position = i + 1;
    const tmp = (d[i] + (10 - position)) % 10;
    // tmp === 0 contributes 9; otherwise (tmp * 2^(10-position)) mod 9, with
    // a zero result also read as 9.
    sum += tmp === 0 ? 9 : (tmp * 2 ** (10 - position)) % 9 || 9;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * VKN check digit (the GİB's "mod 9" algorithm).
 *
 * Worth knowing: because the algorithm collapses two distinct intermediate
 * values onto 9, it catches roughly 98 % of single-digit typos, not all of
 * them. It is a screen against fat fingers, not a guarantee the number is
 * real — only the GİB can say that.
 */
export function isValidVkn(value: string): boolean {
  const v = value.trim();
  if (!/^\d{10}$/.test(v)) return false;
  return vknCheckDigit(v.slice(0, 9)) === Number(v[9]);
}

/** T.C. Kimlik No: 11 digits, non-zero first digit, two trailing check digits. */
export function isValidTckn(value: string): boolean {
  const v = value.trim();
  if (!/^\d{11}$/.test(v)) return false;
  if (v[0] === "0") return false;
  const d = v.split("").map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8]; // 1st, 3rd, 5th, 7th, 9th
  const even = d[1] + d[3] + d[5] + d[7];
  if ((odd * 7 - even) % 10 !== d[9]) return false;
  const first10 = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return first10 % 10 === d[10];
}

export function isValidTurkishTaxId(
  kind: TurkishTaxIdKind,
  value: string,
): boolean {
  return kind === "vkn" ? isValidVkn(value) : isValidTckn(value);
}

/** Guess the kind from the length, for imported data that does not say. */
export function inferTaxIdKind(value: string): TurkishTaxIdKind {
  return value.trim().length === 11 ? "tckn" : "vkn";
}

/* ------------------------------------------------------------------ */
/* KDV                                                                 */
/* ------------------------------------------------------------------ */

export function isKdvRate(rate: number): rate is KdvRate {
  return (KDV_RATES as readonly number[]).includes(rate);
}

/**
 * Dental equipment sits in the 20 % general band; the reduced bands exist for
 * goods Dentec does not usually sell, so they are offered but never guessed.
 */
export const DEFAULT_KDV: KdvRate = 20;

/**
 * A TR document may only carry the three legal bands. Anything else is
 * reported rather than silently coerced — a wrong VAT rate on an issued
 * invoice is a filing problem, not a display problem.
 */
export function invalidKdvRates(invoice: SalesInvoice): number[] {
  const bad = new Set<number>();
  for (const line of invoice.lines) {
    if (!isKdvRate(line.taxRate)) bad.add(line.taxRate);
  }
  return [...bad].sort((a, b) => a - b);
}

/* ------------------------------------------------------------------ */
/* Document type                                                       */
/* ------------------------------------------------------------------ */

/**
 * The type a document *should* be, given its region and its buyer.
 *
 * The TR split is not a preference: a buyer in the GİB e-Fatura user list
 * must receive an e-Fatura, and one outside it must receive an e-Arşiv.
 * Sending the wrong one gets the document rejected.
 */
export function resolveDocumentType(
  invoice: Pick<SalesInvoice, "documentType" | "billingRegion">,
  customer: Customer | undefined,
): InvoiceDocumentType {
  if (invoice.documentType) return invoice.documentType;

  const region = resolveRegion(invoice.billingRegion ? invoice : customer);
  if (region === "SY") return "export";
  return customer?.turkey?.eInvoiceUser ? "e_fatura" : "e_arsiv";
}

/** Document types that belong to each region, for the type picker. */
export const DOCUMENT_TYPES: Record<BillingRegion, InvoiceDocumentType[]> = {
  TR: ["e_fatura", "e_arsiv", "fatura", "e_irsaliye"],
  SY: ["export"],
};

/** e-İrsaliye is the only type that needs the dispatch block. */
export function needsDispatch(type: InvoiceDocumentType): boolean {
  return type === "e_irsaliye";
}

/** Only the two GİB-routed types get an XML/UBL payload. */
export function isEDocument(type: InvoiceDocumentType): boolean {
  return type === "e_fatura" || type === "e_arsiv" || type === "e_irsaliye";
}

/* ------------------------------------------------------------------ */
/* Readiness                                                           */
/* ------------------------------------------------------------------ */

export interface ComplianceIssue {
  /** Which side of the document is incomplete. */
  field: string;
  /** A `MessageKey`-shaped code the UI turns into a translated sentence. */
  code:
    | "missingTaxId"
    | "invalidTaxId"
    | "missingTaxOffice"
    | "missingGibAlias"
    | "missingDispatch"
    | "invalidKdv"
    | "missingRegister";
  detail?: string;
}

/**
 * Everything that would make an integrator reject this document, gathered in
 * one pass. Returning a list rather than throwing lets the detail page show
 * all of them at once instead of one per save.
 */
export function complianceIssues(
  invoice: SalesInvoice,
  customer: Customer | undefined,
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const region = resolveRegion(invoice.billingRegion ? invoice : customer);
  const type = resolveDocumentType(invoice, customer);

  if (region === "TR") {
    const tr = customer?.turkey;
    if (!tr?.taxId) {
      issues.push({ field: "customer.taxId", code: "missingTaxId" });
    } else if (!isValidTurkishTaxId(tr.taxIdKind ?? inferTaxIdKind(tr.taxId), tr.taxId)) {
      issues.push({ field: "customer.taxId", code: "invalidTaxId", detail: tr.taxId });
    }
    if (!tr?.taxOffice) {
      issues.push({ field: "customer.taxOffice", code: "missingTaxOffice" });
    }
    if (type === "e_fatura" && !tr?.gibAlias) {
      // An e-Fatura with no mailbox has nowhere to be delivered.
      issues.push({ field: "customer.gibAlias", code: "missingGibAlias" });
    }
    const badRates = invalidKdvRates(invoice);
    if (badRates.length > 0) {
      issues.push({
        field: "lines.taxRate",
        code: "invalidKdv",
        detail: badRates.join(", "),
      });
    }
    if (needsDispatch(type) && !isDispatchComplete(invoice.dispatch)) {
      issues.push({ field: "dispatch", code: "missingDispatch" });
    }
  } else {
    if (!customer?.syria?.commercialRegisterNo) {
      issues.push({ field: "customer.commercialRegisterNo", code: "missingRegister" });
    }
  }

  return issues;
}

export function isDispatchComplete(d: DispatchInfo | undefined): boolean {
  return Boolean(
    d && d.vehiclePlate.trim() && d.driverName.trim() && d.dispatchedAt,
  );
}

/* ------------------------------------------------------------------ */
/* Blanks                                                              */
/* ------------------------------------------------------------------ */

export function blankTurkeyProfile(): TurkeyTaxProfile {
  return {
    taxIdKind: "vkn",
    taxId: "",
    taxOffice: "",
    tradeRegistryNo: "",
    gibAlias: "",
    eInvoiceUser: false,
    mersisNo: "",
  };
}

export function blankSyriaProfile() {
  return {
    commercialRegisterNo: "",
    importLicenseNo: "",
    customsOffice: "",
    exemptionNote: "",
  };
}

/**
 * Turkish plates are printed with a space after the province code —
 * "34 ABC 123" — and integrators expect them unspaced. Normalise on the way
 * in, format on the way out.
 */
export function normalisePlate(plate: string): string {
  return plate.toUpperCase().replace(/[\s-]/g, "");
}

export function formatPlate(plate: string): string {
  const p = normalisePlate(plate);
  const m = /^(\d{2})([A-Z]{1,3})(\d{2,5})$/.exec(p);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : plate;
}
