/**
 * A self-contained check over the pure billing and localisation logic:
 * Arabic counted-noun agreement, Turkish VKN/TCKN check digits, per-band VAT
 * totals, document-type resolution, compliance gaps, and the UBL-TR payloads.
 *
 * The project has no test runner, so this is deliberately dependency-free —
 * `npm run check` compiles it and runs it. It exists because these rules are
 * the kind that look right and are wrong: the VKN check digit was off by one
 * position for its first draft, and nothing on screen would have shown it.
 */

import { isValidVkn, vknCheckDigit, isValidTckn, complianceIssues, formatPlate, resolveDocumentType } from "../src/lib/billing/region";
import { formatArabicPlural, formatArabicDuration, AR_NOUNS, countedNoun, countedPhrase } from "../src/lib/plural";
import { buildUblPayload } from "../src/lib/billing/ubl-tr";
import { computeTotals, taxBreakdown } from "../src/lib/money";
import type { Customer, SalesInvoice, Settings, Item } from "../src/lib/data/types";

let fails = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log("FAIL", label, "got", JSON.stringify(got), "want", JSON.stringify(want)); }
  else console.log("  ok ", label, "=", JSON.stringify(got));
};

console.log("\n-- Arabic plurals --");
eq("0 days", formatArabicPlural(0, AR_NOUNS.day), "أيام");
eq("1 day", formatArabicPlural(1, AR_NOUNS.day), "يوم");
eq("2 days", formatArabicPlural(2, AR_NOUNS.day), "يومين");
eq("6 days", formatArabicPlural(6, AR_NOUNS.day), "أيام");
eq("11 days", formatArabicPlural(11, AR_NOUNS.day), "يومًا");
eq("13 days", formatArabicPlural(13, AR_NOUNS.day), "يومًا");
eq("100 days", formatArabicPlural(100, AR_NOUNS.day), "يوم");
eq("103 days", formatArabicPlural(103, AR_NOUNS.day), "أيام");
eq("7 invoices", formatArabicPlural(7, AR_NOUNS.invoice), "فواتير");
eq("duration 6", formatArabicDuration(6), "6 أيام");
eq("duration 1", formatArabicDuration(1), "يوم واحد");
eq("tr locale", countedNoun("tr", "day", 6), "gün");

// The counted PHRASE, which is what the UI actually renders. 1 and 2 must not
// print their numeral — the noun form already carries the count, and
// "منذ 2 يومين" reads as "two two-days".
eq("phrase 1", countedPhrase("ar", "day", 1), "يوم");
eq("phrase 2", countedPhrase("ar", "day", 2), "يومين");
eq("phrase 6", countedPhrase("ar", "day", 6), "6 أيام");
eq("phrase 13", countedPhrase("ar", "day", 13), "13 يومًا");
eq("phrase 1 invoice", countedPhrase("ar", "invoice", 1), "فاتورة");
eq("phrase 7 invoices", countedPhrase("ar", "invoice", 7), "7 فواتير");
eq("phrase tr keeps numeral", countedPhrase("tr", "day", 2), "2 gün");
eq("phrase tr 1", countedPhrase("tr", "invoice", 1), "1 fatura");

console.log("\n-- Turkish identifiers --");
const goodVkn = "382019947" + vknCheckDigit("382019947");
eq("generated VKN validates", isValidVkn(goodVkn), true);
eq("single-digit corruption caught", isValidVkn(goodVkn.slice(0,9) + ((Number(goodVkn[9])+1)%10)), false);
// A check digit must catch any single-digit typo anywhere in the number.
let missed = 0;
for (let pos = 0; pos < 9; pos++) for (let d = 0; d <= 9; d++) {
  if (Number(goodVkn[pos]) === d) continue;
  const typo = goodVkn.slice(0,pos) + d + goodVkn.slice(pos+1);
  if (isValidVkn(typo)) missed++;
}
// The GİB algorithm collapses two different intermediate values onto 9, so
// it catches ~98 % of single-digit typos rather than all of them. That is the
// real algorithm's behaviour, not a defect here — the test pins the property
// we actually have so a future rewrite cannot quietly make it worse.
eq("catches nearly every single-digit typo", missed <= 2, true);
eq("VKN wrong length", isValidVkn("38201994"), false);
eq("TCKN valid", isValidTckn("10000000146"), true);
eq("TCKN leading zero", isValidTckn("01234567890"), false);
eq("plate", formatPlate("34abc123"), "34 ABC 123");

console.log("\n-- Tax bands --");
const lines = [
  { id: "l1", itemId: "i1", description: "Chair", qty: 1, unitPrice: 1000, discountPercent: 0, taxRate: 20 },
  { id: "l2", itemId: "i2", description: "Kit",   qty: 2, unitPrice: 100,  discountPercent: 0, taxRate: 10 },
];
const totals = computeTotals(lines, "percent", 10);
eq("subtotal", totals.subtotal, 1200);
eq("discount", totals.discount, 120);
eq("net", totals.net, 1080);
eq("bands", taxBreakdown(lines, totals), [
  { rate: 10, taxable: 180, tax: 18 },
  { rate: 20, taxable: 900, tax: 180 },
]);
eq("total", totals.total, 1278);

console.log("\n-- Compliance + UBL --");
const settings = { companyName: "Dentec", companyNameTr: "Dentec", address: "A", phone: "P", email: "E", taxNumber: "3820199471" } as Settings;
const customer = {
  id: "cu1", name: "Klinik", address: "Addr", city: "İstanbul", taxNumber: "",
  billingRegion: "TR",
  turkey: { taxIdKind: "vkn", taxId: goodVkn, taxOffice: "Beyoğlu", tradeRegistryNo: "1-1", gibAlias: "urn:mail:defaultpk@x.com", eInvoiceUser: true, mersisNo: "M" },
} as unknown as Customer;
const invoice = {
  id: "inv1", number: "INV-2026-0001", date: "2026-01-15", dueDate: "2026-02-15",
  customerId: "cu1", currency: "TRY", fxRate: 1, status: "issued", issuedAt: "2026-01-15T10:00:00Z",
  discountKind: "percent", discountValue: 10, lines, notes: "", billingRegion: "TR",
} as unknown as SalesInvoice;

eq("doc type", resolveDocumentType(invoice, customer), "e_fatura");
eq("no issues", complianceIssues(invoice, customer), []);

const noAlias = { ...customer, turkey: { ...customer.turkey!, gibAlias: "" } };
eq("missing alias", complianceIssues(invoice, noAlias).map(i => i.code), ["missingGibAlias"]);

const badRate = { ...invoice, lines: [{ ...lines[0], taxRate: 18 }] };
eq("illegal KDV", complianceIssues(badRate, customer).map(i => i.code), ["invalidKdv"]);

const items = new Map<string, Item>([["i1", { id: "i1", sku: "CHR-1", unit: "piece", brand: "Runyes", model: "U200", nameAr: "كرسي", nameTr: "Koltuk" } as Item]]);
const payload = buildUblPayload({ invoice, customer, settings, items, serials: { l1: "SN-4471" } });
eq("payload kind", payload.kind, "invoice");
eq("profile", payload.profile, "TICARIFATURA");
const doc = payload.document as any;
eq("customization", doc.CustomizationID, "TR1.2");
eq("buyer VKN", doc.AccountingCustomerParty.Party.PartyIdentification[0].ID, { schemeID: "VKN", value: goodVkn });
eq("vergi dairesi", doc.AccountingCustomerParty.Party.PartyTaxScheme.TaxScheme.Name, "Beyoğlu");
eq("tax subtotals", doc.TaxTotal.TaxSubtotal.map((x: any) => [x.Percent, x.TaxAmount.value]), [[10, 18], [20, 180]]);
eq("payable", doc.LegalMonetaryTotal.PayableAmount.value, 1278);
eq("serial", doc.InvoiceLine[0].Item.ItemInstance, [{ SerialID: "SN-4471" }]);
eq("no fx block for TRY", doc.PricingExchangeRate, undefined);

const usd = { ...invoice, currency: "USD", fxRate: 34.5 } as SalesInvoice;
eq("fx block for USD", (buildUblPayload({ invoice: usd, customer, settings, items }).document as any).PricingExchangeRate?.CalculationRate, 34.5);

const irsaliye = { ...invoice, documentType: "e_irsaliye", dispatch: { vehiclePlate: "34ABC123", driverName: "Mehmet Ali Yıldız", driverTckn: "10000000146", carrierName: "Kargo", carrierTaxId: "3820199471", dispatchedAt: "2026-01-16T08:30:00Z", deliveryAddress: "Depo" } } as unknown as SalesInvoice;
const dp = buildUblPayload({ invoice: irsaliye, customer, settings, items });
eq("despatch kind", dp.kind, "despatch");
const dd = dp.document as any;
eq("plate", dd.Shipment.ShipmentStage[0].TransportMeans.RoadTransport.LicensePlateID, "34ABC123");
eq("driver split", [dd.Shipment.ShipmentStage[0].DriverPerson[0].FirstName, dd.Shipment.ShipmentStage[0].DriverPerson[0].FamilyName], ["Mehmet Ali", "Yıldız"]);
eq("despatch date", dd.Shipment.Delivery.Despatch.ActualDespatchDate, "2026-01-16");
eq("despatch time", dd.Shipment.Delivery.Despatch.ActualDespatchTime, "08:30:00");
eq("no money on despatch", (dd as any).LegalMonetaryTotal, undefined);

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
