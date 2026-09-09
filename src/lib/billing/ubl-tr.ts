/**
 * UBL-TR 1.2 payload construction.
 *
 * Dentec does not talk to the GİB directly — a private integrator (Uyumsoft,
 * Logo, Foriba) does, and every one of them accepts a JSON body that mirrors
 * the UBL-TR element tree before serialising it to XML themselves. So this
 * module builds that tree, named exactly as UBL names it, and stops there.
 * No network calls, no credentials, no XML: the transport is the integrator's
 * problem and swapping between them should not reach past this file.
 *
 * The shape follows TR e-Fatura / e-Arşiv (`Invoice`) and e-İrsaliye
 * (`DespatchAdvice`), which share most of their parties and lines and differ
 * at the top and in whether money appears at all.
 */

import type {
  Customer,
  DocumentLine,
  Item,
  SalesInvoice,
  Settings,
} from "../data/types";
import { computeTotals, round2, taxBreakdown } from "../money";
import {
  formatPlate,
  inferTaxIdKind,
  needsDispatch,
  normalisePlate,
  resolveDocumentType,
} from "./region";

/** UBL wants dates as `YYYY-MM-DD` and times as `HH:MM:SS`. */
function ublDate(iso: string): string {
  return iso.slice(0, 10);
}

function ublTime(iso: string): string {
  return iso.length > 10 ? iso.slice(11, 19) : "00:00:00";
}

/* ------------------------------------------------------------------ */
/* Shared fragments                                                    */
/* ------------------------------------------------------------------ */

export interface UblParty {
  WebsiteURI?: string;
  PartyIdentification: { ID: { schemeID: string; value: string } }[];
  PartyName: { Name: string };
  PostalAddress: {
    StreetName: string;
    CitySubdivisionName: string;
    CityName: string;
    Country: { Name: string };
  };
  PartyTaxScheme?: { TaxScheme: { Name: string } };
  Contact?: { Telephone?: string; ElectronicMail?: string };
}

export interface UblTaxSubtotal {
  TaxableAmount: { currencyID: string; value: number };
  TaxAmount: { currencyID: string; value: number };
  Percent: number;
  TaxCategory: { TaxScheme: { Name: string; TaxTypeCode: string } };
}

export interface UblInvoiceLine {
  ID: string;
  InvoicedQuantity: { unitCode: string; value: number };
  LineExtensionAmount: { currencyID: string; value: number };
  AllowanceCharge?: {
    ChargeIndicator: false;
    MultiplierFactorNumeric: number;
    Amount: { currencyID: string; value: number };
  }[];
  TaxTotal: {
    TaxAmount: { currencyID: string; value: number };
    TaxSubtotal: UblTaxSubtotal[];
  };
  Item: {
    Name: string;
    SellersItemIdentification?: { ID: string };
    BrandName?: string;
    ModelName?: string;
    /** Serial numbers travel as an ItemInstance — this is how a tracked
     *  autoclave or compressor is identified on a Turkish e-document. */
    ItemInstance?: { SerialID: string }[];
  };
  Price: { PriceAmount: { currencyID: string; value: number } };
}

/**
 * UBL unit codes (UN/ECE Recommendation 20). `C62` is the generic "one".
 */
const UNIT_CODE: Record<string, string> = {
  piece: "C62",
  box: "BX",
  set: "SET",
  meter: "MTR",
  kg: "KGM",
  liter: "LTR",
};

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export interface UblContext {
  invoice: SalesInvoice;
  customer: Customer | undefined;
  settings: Settings;
  /** Items by id, for SKU, brand and unit. Serials come from the line notes. */
  items: Map<string, Item>;
  /** Serial numbers keyed by document-line id, where the machine is tracked. */
  serials?: Record<string, string>;
}

function supplierParty(settings: Settings): UblParty {
  return {
    PartyIdentification: [
      { ID: { schemeID: "VKN", value: settings.taxNumber } },
    ],
    PartyName: { Name: settings.companyNameTr || settings.companyName },
    PostalAddress: {
      StreetName: settings.address,
      CitySubdivisionName: "",
      CityName: "",
      Country: { Name: "Türkiye" },
    },
    PartyTaxScheme: { TaxScheme: { Name: "" } },
    Contact: { Telephone: settings.phone, ElectronicMail: settings.email },
  };
}

function customerParty(customer: Customer | undefined): UblParty {
  const tr = customer?.turkey;
  const taxId = tr?.taxId ?? customer?.taxNumber ?? "";
  const kind = tr?.taxIdKind ?? inferTaxIdKind(taxId);

  const ids: UblParty["PartyIdentification"] = [
    { ID: { schemeID: kind === "tckn" ? "TCKN" : "VKN", value: taxId } },
  ];
  if (tr?.tradeRegistryNo) {
    ids.push({ ID: { schemeID: "TICARETSICILNO", value: tr.tradeRegistryNo } });
  }
  if (tr?.mersisNo) {
    ids.push({ ID: { schemeID: "MERSISNO", value: tr.mersisNo } });
  }

  return {
    PartyIdentification: ids,
    PartyName: { Name: customer?.name ?? "" },
    PostalAddress: {
      StreetName: customer?.address ?? "",
      CitySubdivisionName: "",
      CityName: customer?.city ?? "",
      Country: { Name: "Türkiye" },
    },
    // Vergi Dairesi rides in the tax scheme name — this is where UBL-TR puts it.
    PartyTaxScheme: { TaxScheme: { Name: tr?.taxOffice ?? "" } },
    Contact: {
      Telephone: customer?.phone,
      ElectronicMail: customer?.email,
    },
  };
}

function buildLines(ctx: UblContext, currency: string): UblInvoiceLine[] {
  const { invoice, items, serials } = ctx;
  const totals = computeTotals(
    invoice.lines,
    invoice.discountKind,
    invoice.discountValue,
  );

  return invoice.lines.map((line: DocumentLine, i) => {
    const computed = totals.lines.find((l) => l.id === line.id);
    const item = line.itemId ? items.get(line.itemId) : undefined;
    const serial = serials?.[line.id];

    const ublLine: UblInvoiceLine = {
      ID: String(i + 1),
      InvoicedQuantity: {
        unitCode: UNIT_CODE[item?.unit ?? "piece"] ?? "C62",
        value: line.qty,
      },
      LineExtensionAmount: {
        currencyID: currency,
        value: computed?.taxable ?? 0,
      },
      TaxTotal: {
        TaxAmount: { currencyID: currency, value: computed?.tax ?? 0 },
        TaxSubtotal: [
          {
            TaxableAmount: {
              currencyID: currency,
              value: computed?.taxable ?? 0,
            },
            TaxAmount: { currencyID: currency, value: computed?.tax ?? 0 },
            Percent: line.taxRate || 0,
            TaxCategory: {
              // 0015 is the GİB code for KDV.
              TaxScheme: { Name: "KDV", TaxTypeCode: "0015" },
            },
          },
        ],
      },
      Item: {
        Name: line.description || item?.nameTr || item?.nameAr || "",
        SellersItemIdentification: item?.sku ? { ID: item.sku } : undefined,
        BrandName: item?.brand || undefined,
        ModelName: item?.model || undefined,
        ItemInstance: serial ? [{ SerialID: serial }] : undefined,
      },
      Price: { PriceAmount: { currencyID: currency, value: line.unitPrice } },
    };

    if (line.discountPercent > 0) {
      ublLine.AllowanceCharge = [
        {
          ChargeIndicator: false,
          MultiplierFactorNumeric: round2(line.discountPercent / 100),
          Amount: {
            currencyID: currency,
            value: round2((computed?.gross ?? 0) - (computed?.net ?? 0)),
          },
        },
      ];
    }

    return ublLine;
  });
}

/* ------------------------------------------------------------------ */
/* Invoice (e-Fatura / e-Arşiv)                                        */
/* ------------------------------------------------------------------ */

export interface UblInvoice {
  UBLVersionID: "2.1";
  CustomizationID: "TR1.2";
  /** `SATIS` for a normal sale; the GİB's profile lives in ProfileID. */
  ProfileID: "TEMELFATURA" | "TICARIFATURA" | "EARSIVFATURA";
  ID: string;
  /** The integrator fills the UUID if it is left blank; we send ours. */
  UUID: string;
  IssueDate: string;
  IssueTime: string;
  InvoiceTypeCode: "SATIS";
  DocumentCurrencyCode: string;
  LineCountNumeric: number;
  Note?: string[];
  AccountingSupplierParty: { Party: UblParty };
  AccountingCustomerParty: { Party: UblParty };
  /** Present only when the document currency is not TRY. */
  PricingExchangeRate?: {
    SourceCurrencyCode: string;
    TargetCurrencyCode: string;
    CalculationRate: number;
    Date: string;
  };
  AllowanceCharge?: {
    ChargeIndicator: false;
    Amount: { currencyID: string; value: number };
  }[];
  TaxTotal: {
    TaxAmount: { currencyID: string; value: number };
    TaxSubtotal: UblTaxSubtotal[];
  };
  LegalMonetaryTotal: {
    LineExtensionAmount: { currencyID: string; value: number };
    TaxExclusiveAmount: { currencyID: string; value: number };
    TaxInclusiveAmount: { currencyID: string; value: number };
    AllowanceTotalAmount: { currencyID: string; value: number };
    PayableAmount: { currencyID: string; value: number };
  };
  InvoiceLine: UblInvoiceLine[];
}

export function buildUblInvoice(ctx: UblContext): UblInvoice {
  const { invoice, customer, settings } = ctx;
  const currency = invoice.currency;
  const totals = computeTotals(
    invoice.lines,
    invoice.discountKind,
    invoice.discountValue,
  );
  const bands = taxBreakdown(invoice.lines, totals);
  const type = resolveDocumentType(invoice, customer);

  const amount = (value: number) => ({ currencyID: currency, value });

  const doc: UblInvoice = {
    UBLVersionID: "2.1",
    CustomizationID: "TR1.2",
    ProfileID:
      type === "e_arsiv"
        ? "EARSIVFATURA"
        : // TEMELFATURA cannot be rejected by the buyer; TICARIFATURA can.
          // Equipment sales go out commercially so a dispute has a channel.
          "TICARIFATURA",
    ID: invoice.number,
    UUID: invoice.id,
    IssueDate: ublDate(invoice.date),
    IssueTime: ublTime(invoice.issuedAt ?? invoice.date),
    InvoiceTypeCode: "SATIS",
    DocumentCurrencyCode: currency,
    LineCountNumeric: invoice.lines.length,
    Note: invoice.notes ? [invoice.notes] : undefined,
    AccountingSupplierParty: { Party: supplierParty(settings) },
    AccountingCustomerParty: { Party: customerParty(customer) },
    TaxTotal: {
      TaxAmount: amount(totals.tax),
      TaxSubtotal: bands.map((b) => ({
        TaxableAmount: amount(b.taxable),
        TaxAmount: amount(b.tax),
        Percent: b.rate,
        TaxCategory: { TaxScheme: { Name: "KDV", TaxTypeCode: "0015" } },
      })),
    },
    LegalMonetaryTotal: {
      LineExtensionAmount: amount(totals.subtotal),
      TaxExclusiveAmount: amount(totals.net),
      TaxInclusiveAmount: amount(totals.total),
      AllowanceTotalAmount: amount(totals.discount),
      PayableAmount: amount(totals.total),
    },
    InvoiceLine: buildLines(ctx, currency),
  };

  if (totals.discount > 0) {
    doc.AllowanceCharge = [
      { ChargeIndicator: false, Amount: amount(totals.discount) },
    ];
  }

  // A foreign-currency document must state its rate to TRY, or the GİB has
  // no way to value the KDV it is being told about.
  if (currency !== "TRY") {
    doc.PricingExchangeRate = {
      SourceCurrencyCode: currency,
      TargetCurrencyCode: "TRY",
      CalculationRate: invoice.fxRate || 1,
      Date: ublDate(invoice.date),
    };
  }

  return doc;
}

/* ------------------------------------------------------------------ */
/* Despatch advice (e-İrsaliye)                                        */
/* ------------------------------------------------------------------ */

export interface UblDespatchAdvice {
  UBLVersionID: "2.1";
  CustomizationID: "TR1.2";
  ProfileID: "TEMELIRSALIYE";
  ID: string;
  UUID: string;
  IssueDate: string;
  IssueTime: string;
  DespatchAdviceTypeCode: "SEVK";
  LineCountNumeric: number;
  Note?: string[];
  DespatchSupplierParty: { Party: UblParty };
  DeliveryCustomerParty: { Party: UblParty };
  Shipment: {
    ID: string;
    /** Fiili sevk tarihi / saati — when the goods actually left. */
    Delivery: {
      DeliveryAddress: { StreetName: string; CityName: string; Country: { Name: string } };
      Despatch: { ActualDespatchDate: string; ActualDespatchTime: string };
      CarrierParty?: UblParty;
    };
    ShipmentStage: {
      TransportModeCode: "3";
      TransportMeans: {
        RoadTransport: { LicensePlateID: string };
      };
      DriverPerson: {
        FirstName: string;
        FamilyName: string;
        NationalityID?: string;
      }[];
    }[];
  };
  /** Quantities only — a despatch advice carries no money. */
  DespatchLine: {
    ID: string;
    DeliveredQuantity: { unitCode: string; value: number };
    OrderLineReference: { LineID: string };
    Item: UblInvoiceLine["Item"];
  }[];
}

/**
 * The dispatch note that travels with a chair, compressor or autoclave.
 * Deliberately built from the same invoice: the goods on the truck and the
 * goods on the invoice are the same goods, and duplicating the line list
 * would let them drift.
 */
export function buildUblDespatchAdvice(ctx: UblContext): UblDespatchAdvice {
  const { invoice, customer, settings, items, serials } = ctx;
  const d = invoice.dispatch;

  if (!needsDispatch(resolveDocumentType(invoice, customer)) && !d) {
    throw new Error("buildUblDespatchAdvice called on a non-dispatch document");
  }

  // "Mehmet Ali Yıldız" → first names and family name, as UBL splits them.
  const nameParts = (d?.driverName ?? "").trim().split(/\s+/).filter(Boolean);
  const familyName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";
  const firstName = nameParts.slice(0, -1).join(" ") || nameParts[0] || "";

  return {
    UBLVersionID: "2.1",
    CustomizationID: "TR1.2",
    ProfileID: "TEMELIRSALIYE",
    ID: invoice.number,
    UUID: invoice.id,
    IssueDate: ublDate(invoice.date),
    IssueTime: ublTime(d?.dispatchedAt ?? invoice.date),
    DespatchAdviceTypeCode: "SEVK",
    LineCountNumeric: invoice.lines.length,
    Note: invoice.notes ? [invoice.notes] : undefined,
    DespatchSupplierParty: { Party: supplierParty(settings) },
    DeliveryCustomerParty: { Party: customerParty(customer) },
    Shipment: {
      ID: invoice.number,
      Delivery: {
        DeliveryAddress: {
          StreetName: d?.deliveryAddress || customer?.address || "",
          CityName: customer?.city ?? "",
          Country: { Name: "Türkiye" },
        },
        Despatch: {
          ActualDespatchDate: ublDate(d?.dispatchedAt ?? invoice.date),
          ActualDespatchTime: ublTime(d?.dispatchedAt ?? invoice.date),
        },
        CarrierParty: d?.carrierName
          ? {
              PartyIdentification: [
                { ID: { schemeID: "VKN", value: d.carrierTaxId } },
              ],
              PartyName: { Name: d.carrierName },
              PostalAddress: {
                StreetName: "",
                CitySubdivisionName: "",
                CityName: "",
                Country: { Name: "Türkiye" },
              },
            }
          : undefined,
      },
      ShipmentStage: [
        {
          TransportModeCode: "3", // road
          TransportMeans: {
            RoadTransport: {
              LicensePlateID: normalisePlate(d?.vehiclePlate ?? ""),
            },
          },
          DriverPerson: [
            {
              FirstName: firstName,
              FamilyName: familyName,
              NationalityID: d?.driverTckn || undefined,
            },
          ],
        },
      ],
    },
    DespatchLine: invoice.lines.map((line, i) => {
      const item = line.itemId ? items.get(line.itemId) : undefined;
      const serial = serials?.[line.id];
      return {
        ID: String(i + 1),
        DeliveredQuantity: {
          unitCode: UNIT_CODE[item?.unit ?? "piece"] ?? "C62",
          value: line.qty,
        },
        OrderLineReference: { LineID: String(i + 1) },
        Item: {
          Name: line.description || item?.nameTr || item?.nameAr || "",
          SellersItemIdentification: item?.sku ? { ID: item.sku } : undefined,
          BrandName: item?.brand || undefined,
          ModelName: item?.model || undefined,
          ItemInstance: serial ? [{ SerialID: serial }] : undefined,
        },
      };
    }),
  };
}

/**
 * The one entry point a route or an action should call: hand it a context,
 * get back whatever payload that document legally is, tagged so the caller
 * knows which integrator endpoint it belongs to.
 */
export type UblPayload =
  | { kind: "invoice"; profile: UblInvoice["ProfileID"]; document: UblInvoice }
  | { kind: "despatch"; profile: "TEMELIRSALIYE"; document: UblDespatchAdvice };

export function buildUblPayload(ctx: UblContext): UblPayload {
  const type = resolveDocumentType(ctx.invoice, ctx.customer);
  if (type === "e_irsaliye") {
    return {
      kind: "despatch",
      profile: "TEMELIRSALIYE",
      document: buildUblDespatchAdvice(ctx),
    };
  }
  const document = buildUblInvoice(ctx);
  return { kind: "invoice", profile: document.ProfileID, document };
}

/** Human-facing plate, for the printed copy. Re-exported so the PDF layer
 *  does not need to reach into `region.ts` for one formatter. */
export { formatPlate };
