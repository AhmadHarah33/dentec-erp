/**
 * The printed A4 document, for invoices and purchase orders alike.
 *
 * This is what the PDF pipeline photographs: a Server Component with no
 * interactivity, rendered on its own route with no app shell. Chromium does
 * the Arabic shaping and the bidi reordering, which is the whole reason the
 * PDF is produced from HTML rather than drawn primitive by primitive — a
 * layout engine that gets Arabic right already exists and there is no sense
 * in writing a worse one.
 *
 * Region shapes the document, it does not fork it: a TR invoice gains a KDV
 * breakdown and a GİB block, an SY invoice gains customs and a restated
 * total, and everything else on the sheet is the same sheet.
 */

import type {
  BillingRegion,
  CurrencyCode,
  Customer,
  DispatchInfo,
  DocumentLine,
  InvoiceDocumentType,
  Item,
  Settings,
  Supplier,
} from "@/lib/data/types";
import type { Locale } from "@/lib/i18n";
import { translatorFor } from "@/lib/i18n";
import { formatDate } from "@/lib/dates";
import {
  computeTotals,
  formatMoney,
  formatNumber,
  taxBreakdown,
} from "@/lib/money";
import { formatPlate } from "@/lib/billing/region";
import type { CurrencyRestatement } from "@/lib/billing/export-sy";

export interface SheetProps {
  kind: "invoice" | "purchase";
  region: BillingRegion;
  documentType?: InvoiceDocumentType;
  number: string;
  date: string;
  /** dueDate on an invoice, expectedDate on a purchase order. */
  secondDate: string;
  currency: CurrencyCode;
  lines: DocumentLine[];
  discountKind: "percent" | "amount";
  discountValue: number;
  notes: string;
  party: Customer | Supplier | undefined;
  settings: Settings;
  items: Map<string, Item>;
  /** Serial numbers keyed by line id, for tracked machinery. */
  serials?: Record<string, string>;
  dispatch?: DispatchInfo;
  restated?: CurrencyRestatement | null;
  exemptionNote?: string;
  locale: Locale;
}

/* ------------------------------------------------------------------ */

/**
 * A labelled value on the sheet.
 *
 * `num` marks an identifier — a plate, a VKN, an IBAN, a phone number. Those
 * have to be LTR-isolated or the bidi algorithm reorders their runs inside an
 * Arabic paragraph: "34 ABC 123" comes out as "ABC 123 34", which is a
 * different plate. Pure prose takes the paragraph direction and must not be
 * isolated, so this is opt-in rather than automatic.
 */
function Field({
  label,
  value,
  num = false,
}: {
  label: string;
  value: string;
  num?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-1.5 leading-snug">
      <span className="text-muted shrink-0">{label}:</span>
      <span className={num ? "font-medium num" : "font-medium break-words"}>
        {value}
      </span>
    </div>
  );
}

/** A figure on paper: tabular, LTR-isolated, never wrapped at a hyphen. */
function N({ children }: { children: React.ReactNode }) {
  return <span className="num">{children}</span>;
}

export function DocumentSheet(props: SheetProps) {
  const {
    kind,
    region,
    documentType,
    number,
    date,
    secondDate,
    currency,
    lines,
    discountKind,
    discountValue,
    notes,
    party,
    settings,
    items,
    serials,
    dispatch,
    restated,
    exemptionNote,
    locale,
  } = props;

  const t = translatorFor(locale);
  const money = (n: number) => formatMoney(n, currency, locale);
  const qty = (n: number) => formatNumber(n, locale, 2);

  const totals = computeTotals(lines, discountKind, discountValue);
  const bands = taxBreakdown(lines, totals);
  const isInvoice = kind === "invoice";
  const isDispatchNote = documentType === "e_irsaliye";

  const companyName =
    locale === "tr" && settings.companyNameTr
      ? settings.companyNameTr
      : settings.companyName;

  // A dispatch note is about goods, not money — the GİB does not want prices
  // on the copy travelling in the cab, so the sheet drops every money column.
  const showMoney = !isDispatchNote;

  const tr = region === "TR" ? (party as Customer | undefined)?.turkey : undefined;
  const sy = region === "SY" ? (party as Customer | undefined)?.syria : undefined;

  const title = isInvoice
    ? documentType
      ? t(`doc.type.${documentType}` as "doc.type.export")
      : t("print.invoice")
    : t("print.purchase");

  return (
    <article className="print-doc mx-auto w-full max-w-[210mm] bg-white text-ink p-8 text-xs">
      {/* ---- Header ------------------------------------------------ */}
      <header className="flex items-start justify-between gap-6 pb-4 border-b border-line">
        <div className="flex items-start gap-3">
          {/* Logo placeholder — swapped for the real mark by dropping a file
              at /public/logo.svg and pointing this at it. */}
          <div className="size-14 shrink-0 rounded-md border border-line grid place-items-center text-brand font-bold text-base">
            {t("app.name")}
          </div>
          <div className="leading-snug">
            <h1 className="text-sm font-bold text-brand">{companyName}</h1>
            <p className="text-2xs text-muted max-w-[60mm]">{settings.address}</p>
            <p className="text-2xs text-muted">
              <N>{settings.phone}</N> · {settings.email}
            </p>
            <p className="text-2xs text-muted">
              {t("label.taxNumber")}: <N>{settings.taxNumber}</N>
              {settings.taxOffice ? ` · ${settings.taxOffice}` : ""}
            </p>
          </div>
        </div>

        <div className="text-end shrink-0">
          <h2 className="text-sm font-bold">{title}</h2>
          <p className="text-2xs mt-1">
            {isInvoice ? t("print.invoiceNo") : t("print.purchaseNo")}:{" "}
            <N>{number}</N>
          </p>
          <p className="text-2xs">
            {t("print.issuedOn")}: <N>{formatDate(date, locale)}</N>
          </p>
          <p className="text-2xs">
            {isInvoice ? t("print.dueOn") : t("label.expectedDate")}:{" "}
            <N>{formatDate(secondDate, locale)}</N>
          </p>
        </div>
      </header>

      {/* ---- Party ------------------------------------------------- */}
      <section className="grid grid-cols-2 gap-6 py-4 border-b border-line">
        <div>
          <p className="text-2xs text-muted mb-1">
            {isInvoice
              ? isDispatchNote
                ? t("print.shipTo")
                : t("print.billTo")
              : t("label.supplier")}
          </p>
          <p className="font-semibold">{party?.name ?? "—"}</p>
          <div className="text-2xs mt-1 space-y-0.5">
            <Field label={t("label.address")} value={party?.address ?? ""} />
            <Field label={t("label.city")} value={party?.city ?? ""} />
            <Field label={t("label.phone")} value={party?.phone ?? ""} num />
            <Field label={t("label.email")} value={party?.email ?? ""} num />
          </div>
        </div>

        {/* The tax block is the half that differs by region. A purchase order
            has no region of its own — the supplier may be anywhere, and
            stamping a Turkish VKN block onto a Chinese factory is nonsense —
            so it gets the plain tax number and nothing else. */}
        <div className="text-2xs space-y-0.5">
          <p className="text-muted mb-1">
            {!isInvoice
              ? t("label.taxNumber")
              : region === "TR"
                ? t("billing.profileTR")
                : t("billing.profileSY")}
          </p>
          {!isInvoice ? (
            <Field label={t("label.taxNumber")} value={party?.taxNumber ?? ""} num />
          ) : region === "TR" ? (
            <>
              <Field
                label={tr?.taxIdKind === "tckn" ? t("billing.tckn") : t("billing.vkn")}
                value={tr?.taxId ?? party?.taxNumber ?? ""}
                num
              />
              <Field label={t("billing.taxOffice")} value={tr?.taxOffice ?? ""} />
              <Field
                label={t("billing.tradeRegistry")}
                value={tr?.tradeRegistryNo ?? ""}
                num
              />
              <Field label={t("billing.gibAlias")} value={tr?.gibAlias ?? ""} num />
              <Field label={t("billing.mersis")} value={tr?.mersisNo ?? ""} num />
            </>
          ) : (
            <>
              <Field
                label={t("billing.commercialRegister")}
                value={sy?.commercialRegisterNo ?? ""}
                num
              />
              <Field
                label={t("billing.importLicense")}
                value={sy?.importLicenseNo ?? ""}
                num
              />
              <Field
                label={t("billing.customsOffice")}
                value={sy?.customsOffice ?? ""}
              />
              <Field label={t("print.origin")} value={locale === "tr" ? "Türkiye" : "تركيا"} />
            </>
          )}
        </div>
      </section>

      {/* ---- Dispatch (e-İrsaliye only) ---------------------------- */}
      {isDispatchNote && dispatch && (
        <section className="py-3 border-b border-line">
          <p className="text-2xs text-muted mb-1.5">{t("dispatch.title")}</p>
          <div className="grid grid-cols-3 gap-x-6 gap-y-0.5 text-2xs">
            <Field
              label={t("dispatch.plate")}
              value={formatPlate(dispatch.vehiclePlate)}
              num
            />
            <Field label={t("dispatch.driver")} value={dispatch.driverName} />
            <Field label={t("dispatch.driverTckn")} value={dispatch.driverTckn} num />
            <Field label={t("dispatch.carrier")} value={dispatch.carrierName} />
            <Field
              label={t("dispatch.carrierTaxId")}
              value={dispatch.carrierTaxId}
              num
            />
            <Field
              label={t("dispatch.dispatchedAt")}
              value={
                dispatch.dispatchedAt
                  ? `${formatDate(dispatch.dispatchedAt.slice(0, 10), locale)} ${dispatch.dispatchedAt.slice(11, 16)}`
                  : ""
              }
            />
            <div className="col-span-3">
              <Field
                label={t("dispatch.deliveryAddress")}
                value={dispatch.deliveryAddress}
              />
            </div>
          </div>
        </section>
      )}

      {/* ---- Lines ------------------------------------------------- */}
      <table className="w-full mt-4 text-2xs border-collapse">
        <thead>
          <tr className="border-b border-ink/40 text-muted">
            <th className="text-start font-medium py-1.5 w-6">#</th>
            <th className="text-start font-medium py-1.5">{t("print.code")}</th>
            <th className="text-start font-medium py-1.5">{t("label.description")}</th>
            <th className="text-start font-medium py-1.5">{t("label.serialNo")}</th>
            <th className="text-end font-medium py-1.5">{t("print.qty")}</th>
            {showMoney && (
              <>
                <th className="text-end font-medium py-1.5">{t("label.unitPrice")}</th>
                <th className="text-end font-medium py-1.5">{t("label.discount")}</th>
                <th className="text-end font-medium py-1.5">{t("print.taxRate")}</th>
                <th className="text-end font-medium py-1.5">{t("label.lineTotal")}</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => {
            const item = line.itemId ? items.get(line.itemId) : undefined;
            const computed = totals.lines.find((l) => l.id === line.id);
            const name =
              line.description ||
              (locale === "tr" && item?.nameTr ? item.nameTr : item?.nameAr) ||
              "—";
            return (
              <tr key={line.id} className="border-b border-line align-top">
                <td className="py-1.5">
                  <N>{i + 1}</N>
                </td>
                <td className="py-1.5">
                  <N>{item?.sku ?? "—"}</N>
                </td>
                <td className="py-1.5 pe-2">
                  {name}
                  {item?.brand || item?.model ? (
                    <span className="text-muted">
                      {" "}
                      — {[item.brand, item.model].filter(Boolean).join(" ")}
                    </span>
                  ) : null}
                </td>
                <td className="py-1.5">
                  <N>{serials?.[line.id] || "—"}</N>
                </td>
                <td className="py-1.5 text-end">
                  <N>{qty(line.qty)}</N>
                </td>
                {showMoney && (
                  <>
                    <td className="py-1.5 text-end">
                      <N>{money(line.unitPrice)}</N>
                    </td>
                    <td className="py-1.5 text-end">
                      <N>{line.discountPercent ? `${line.discountPercent}%` : "—"}</N>
                    </td>
                    <td className="py-1.5 text-end">
                      <N>{line.taxRate}%</N>
                    </td>
                    <td className="py-1.5 text-end font-medium">
                      <N>{money(computed?.total ?? 0)}</N>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ---- Totals ------------------------------------------------ */}
      {showMoney && (
        <section className="flex justify-end mt-4">
          <div className="w-[80mm] text-2xs">
            <div className="flex justify-between py-1">
              <span className="text-muted">{t("label.subtotal")}</span>
              <N>{money(totals.subtotal)}</N>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-muted">{t("label.discount")}</span>
                <N>−{money(totals.discount)}</N>
              </div>
            )}
            <div className="flex justify-between py-1 border-b border-line">
              <span className="text-muted">{t("label.net")}</span>
              <N>{money(totals.net)}</N>
            </div>

            {/* Per-band VAT. A document mixing 10 % and 20 % files as two
                subtotals, so it has to read as two lines here too. */}
            {bands
              .filter((b) => b.rate > 0)
              .map((b) => (
                <div key={b.rate} className="flex justify-between py-1">
                  <span className="text-muted">
                    {region === "TR" ? "KDV" : t("label.tax")} <N>{b.rate}%</N>
                  </span>
                  <N>{money(b.tax)}</N>
                </div>
              ))}

            <div className="flex justify-between py-2 mt-1 border-t-2 border-ink/60 font-bold text-xs">
              <span>{t("label.total")}</span>
              <N>{money(totals.total)}</N>
            </div>

            {restated && (
              <div className="flex justify-between py-1 text-muted">
                <span>
                  {t("print.restated")} <N>{restated.currency}</N>
                </span>
                <N>{restated.formatted}</N>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---- Region notes ------------------------------------------ */}
      {region === "SY" && exemptionNote && (
        <p className="mt-4 text-2xs border border-line rounded-sm p-2 leading-relaxed">
          <span className="text-muted">{t("print.exemption")}: </span>
          {exemptionNote}
        </p>
      )}

      {notes && (
        <p className="mt-3 text-2xs leading-relaxed">
          <span className="text-muted">{t("label.notes")}: </span>
          {notes}
        </p>
      )}

      {/* ---- Footer ------------------------------------------------ */}
      <footer className="mt-6 pt-3 border-t border-line grid grid-cols-3 gap-6 text-2xs">
        <div className="col-span-2 space-y-2">
          {settings.iban && (
            <div>
              <p className="text-muted mb-0.5">{t("print.bank")}</p>
              <Field label={t("print.bankName")} value={settings.bankName ?? ""} />
              <Field label={t("print.iban")} value={settings.iban} num />
              <Field label={t("print.swift")} value={settings.swift ?? ""} num />
              <Field
                label={t("label.company")}
                value={settings.bankAccountName ?? ""}
              />
            </div>
          )}
          {isInvoice && settings.warrantyTerms && (
            <div>
              <p className="text-muted mb-0.5">{t("print.warrantyTerms")}</p>
              <p className="leading-relaxed">{settings.warrantyTerms}</p>
            </div>
          )}
          <p className="text-muted pt-1">{t("print.thanks")}</p>
        </div>

        {/* Signature and stamp: an empty ruled box, because the point of it
            is the space, not the label. */}
        <div>
          <p className="text-muted mb-1">{t("print.signature")}</p>
          <div className="h-20 border border-dashed border-line rounded-sm grid place-items-end justify-center pb-1 text-muted">
            {t("print.stamp")}
          </div>
        </div>
      </footer>
    </article>
  );
}
