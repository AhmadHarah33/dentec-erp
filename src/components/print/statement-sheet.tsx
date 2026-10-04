/**
 * The printed customer statement. Same letterhead as an invoice, then the
 * ledger of invoices and payments with a running balance. A Server Component
 * with no interactivity: the PDF pipeline photographs it.
 */

import type { Customer, Settings } from "@/lib/data/types";
import type { Locale } from "@/lib/i18n";
import { translatorFor } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { Statement } from "@/lib/statement";

/** Cell spacing: padded between columns, flush at the table's outer edges (see the invoice sheet). */
const CELL = "py-1.5 px-1.5 first:ps-0 last:pe-0";
const HEAD = "font-medium py-1.5 px-1.5 first:ps-0 last:pe-0 leading-tight";

function N({ children }: { children: React.ReactNode }) {
  return <span className="num">{children}</span>;
}

export function StatementSheet({
  customer,
  statement,
  settings,
  locale,
}: {
  customer: Customer;
  statement: Statement;
  settings: Settings;
  locale: Locale;
}) {
  const t = translatorFor(locale);
  const money = (n: number) => formatMoney(n, settings.baseCurrency, locale);
  const companyName =
    locale === "tr" && settings.companyNameTr ? settings.companyNameTr : settings.companyName;

  return (
    <article className="print-doc mx-auto w-full max-w-[210mm] bg-white text-ink p-8 text-xs">
      <header className="flex items-start justify-between gap-6 pb-4 border-b border-line">
        <div className="flex flex-col items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt={t("app.name")} className="h-8 w-auto" />
          <div className="leading-snug">
            <h1 className="text-sm font-bold text-brand">{companyName}</h1>
            <p className="text-2xs text-muted max-w-[60mm]">{settings.address}</p>
            <p className="text-2xs text-muted">
              <N>{settings.phone}</N> · {settings.email}
            </p>
            <p className="text-2xs text-muted">
              {t("label.taxNumber")}: <N>{settings.taxNumber}</N>
            </p>
          </div>
        </div>

        <div className="text-end shrink-0">
          <h2 className="text-sm font-bold">{t("statement.title")}</h2>
          <p className="text-2xs mt-1">
            {t("statement.period")}:{" "}
            <N>{statement.from ? formatDate(statement.from, locale) : t("statement.fromStart")}</N>
            {" – "}
            <N>{formatDate(statement.to, locale)}</N>
          </p>
        </div>
      </header>

      <section className="py-4 border-b border-line">
        <p className="text-2xs text-muted mb-1">{t("print.billTo")}</p>
        <p className="font-semibold">{customer.name}</p>
        <p className="text-2xs mt-1 text-muted">
          {[customer.address, customer.city].filter(Boolean).join(" · ")}
        </p>
        {customer.taxNumber && (
          <p className="text-2xs text-muted">
            {t("label.taxNumber")}: <N>{customer.taxNumber}</N>
          </p>
        )}
      </section>

      {/* Fixed layout: the document column takes what the three amount columns leave. */}
      <table className="w-full mt-4 text-2xs border-collapse table-fixed">
        <colgroup>
          <col className="w-[26mm]" />
          <col />
          <col className="w-[33mm]" />
          <col className="w-[33mm]" />
          <col className="w-[33mm]" />
        </colgroup>
        <thead>
          <tr className="border-b border-ink/40 text-muted align-bottom">
            <th className={`${HEAD} text-start`}>{t("label.date")}</th>
            <th className={`${HEAD} text-start`}>{t("statement.document")}</th>
            <th className={`${HEAD} text-end`}>{t("statement.debit")}</th>
            <th className={`${HEAD} text-end`}>{t("statement.credit")}</th>
            <th className={`${HEAD} text-end`}>{t("label.balance")}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-line bg-sunken/40">
            <td className={CELL} colSpan={4}>
              {t("statement.opening")}
            </td>
            <td className={`${CELL} text-end font-medium whitespace-nowrap`}>
              <N>{money(statement.opening)}</N>
            </td>
          </tr>
          {statement.rows.map((r, i) => (
            <tr key={i} className="border-b border-line align-top">
              <td className={`${CELL} whitespace-nowrap`}>
                <N>{formatDate(r.date, locale)}</N>
              </td>
              <td className={`${CELL} break-words`}>
                {r.kind === "invoice" ? (
                  <>
                    {t("statement.invoice")} <N>{r.ref}</N>
                  </>
                ) : (
                  <>
                    {t("statement.payment")}
                    {r.method ? ` · ${t(`method.${r.method}` as MessageKey)}` : ""}
                    {r.ref ? (
                      <>
                        {" · "}
                        <N>{r.ref}</N>
                      </>
                    ) : null}
                  </>
                )}
              </td>
              <td className={`${CELL} text-end whitespace-nowrap`}>{r.debit ? <N>{money(r.debit)}</N> : "—"}</td>
              <td className={`${CELL} text-end whitespace-nowrap`}>{r.credit ? <N>{money(r.credit)}</N> : "—"}</td>
              <td className={`${CELL} text-end font-medium whitespace-nowrap`}>
                <N>{money(r.balance)}</N>
              </td>
            </tr>
          ))}
          {statement.rows.length === 0 && (
            <tr>
              <td className="py-4 text-center text-muted" colSpan={5}>
                {t("statement.noActivity")}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-ink/40 font-semibold">
            <td className="py-2 px-1.5 first:ps-0 last:pe-0" colSpan={2}>
              {t("statement.closing")}
            </td>
            <td className="py-2 px-1.5 text-end whitespace-nowrap">
              <N>{money(statement.totalDebit)}</N>
            </td>
            <td className="py-2 px-1.5 text-end whitespace-nowrap">
              <N>{money(statement.totalCredit)}</N>
            </td>
            <td className="py-2 px-1.5 last:pe-0 text-end whitespace-nowrap">
              <N>{money(statement.closing)}</N>
            </td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-6 text-2xs text-muted">{t("statement.note")}</p>
    </article>
  );
}
