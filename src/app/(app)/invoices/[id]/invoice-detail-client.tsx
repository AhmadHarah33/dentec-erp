"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type {
  Party,
  Payment,
  PaymentMethod,
  SalesInvoice,
  Settings,
} from "@/lib/data/types";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { INVOICE_TONE, invoiceKey, PAYMENT_METHODS } from "@/lib/labels";
import { computeTotals, formatMoney, formatNumber, round2, toBase } from "@/lib/money";
import { formatDate, today } from "@/lib/dates";
import {
  issueInvoice,
  voidInvoice,
  recordInvoicePayment,
} from "@/app/actions/sales";
import { PageHeader, DetailRow, EmptyState } from "@/components/ui/page";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  LinkButton,
  Num,
  NumberInput,
  Select,
} from "@/components/ui/primitives";
import { Modal, Confirm } from "@/components/ui/modal";
import { IconPrint } from "@/components/ui/icons";

interface LineItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
}

export function InvoiceDetailClient({
  invoice,
  customer,
  warehouseName,
  lineItems,
  payments,
  paid,
  settings,
  locale,
}: {
  invoice: SalesInvoice;
  customer: Party | null;
  warehouseName: string;
  lineItems: LineItem[];
  payments: Payment[];
  paid: number;
  settings: Settings;
  locale: string;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<"issue" | "void" | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = settings.baseCurrency;
  const totals = useMemo(
    () => computeTotals(invoice.lines, invoice.discountKind, invoice.discountValue),
    [invoice],
  );

  const money = (n: number) => formatMoney(n, invoice.currency, locale);
  const baseMoney = (n: number) => formatMoney(n, base, locale);

  const totalBase = toBase(totals.total, invoice.fxRate);
  const outstanding = round2(Math.max(totalBase - paid, 0));
  const isDraft = invoice.status === "draft";
  const isVoid = invoice.status === "void";
  const settled = invoice.status === "paid";

  const [payForm, setPayForm] = useState({
    date: today(),
    // Default to clearing the balance — the common case at the counter.
    amount: round2(outstanding / (invoice.fxRate || 1)),
    method: "cash" as PaymentMethod,
    reference: "",
    note: "",
  });

  function run(action: () => Promise<{ ok: boolean; errorKey?: string; detail?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setConfirming(null);
        setPaying(false);
      } else {
        setError(
          t(result.errorKey as MessageKey) + (result.detail ? ` — ${result.detail}` : ""),
        );
      }
    });
  }

  return (
    <>
      {/* Screen chrome — excluded from print by `no-print`. */}
      <PageHeader
        title={invoice.number}
        subtitle={`${customer?.name ?? "—"} · ${formatDate(invoice.date, locale)}`}
        actions={
          <>
            <Badge tone={INVOICE_TONE[invoice.status]}>{t(invoiceKey(invoice.status))}</Badge>
            <LinkButton href="/invoices">{t("action.back")}</LinkButton>
            <Button onClick={() => window.print()}>
              <IconPrint />
              {t("action.print")}
            </Button>
            {isDraft && (
              <Button variant="primary" onClick={() => setConfirming("issue")}>
                {t("action.issue")}
              </Button>
            )}
            {!isDraft && !isVoid && !settled && (
              <Button variant="primary" onClick={() => setPaying(true)}>
                {t("action.recordPayment")}
              </Button>
            )}
            {!isDraft && !isVoid && (
              <Button variant="danger" onClick={() => setConfirming("void")}>
                {t("action.void")}
              </Button>
            )}
          </>
        }
      />

      {error && (
        <p className="text-2xs text-danger border border-danger-soft bg-danger-soft rounded-sm p-2 mb-4 no-print">
          {error}
        </p>
      )}

      {/* ---- The document itself. This is what prints. ---- */}
      <div className="print-doc">
        {/* Letterhead: only on paper, where there is no app chrome to say who we are. */}
        <div className="hidden print:block mb-6">
          <div className="flex items-start justify-between gap-6 pb-3 border-b border-line-strong">
            <div>
              <h1 className="text-base font-semibold">{settings.companyName}</h1>
              <p className="text-2xs text-muted mt-1 leading-relaxed">
                {settings.address}
                <br />
                {settings.phone} · {settings.email}
                <br />
                {t("label.taxNumber")}: {settings.taxNumber}
              </p>
            </div>
            <div className="text-end">
              <h2 className="text-sm font-semibold">{t("print.invoice")}</h2>
              <p className="text-2xs text-muted mt-1 leading-relaxed">
                {t("print.invoiceNo")}: <span className="num">{invoice.number}</span>
                <br />
                {t("print.issuedOn")}: <span className="num">{formatDate(invoice.date, locale)}</span>
                <br />
                {t("print.dueOn")}: <span className="num">{formatDate(invoice.dueDate, locale)}</span>
              </p>
            </div>
          </div>
          {customer && (
            <div className="mt-4">
              <p className="text-2xs text-muted">{t("print.billTo")}</p>
              <p className="text-xs font-medium mt-0.5">{customer.name}</p>
              <p className="text-2xs text-muted leading-relaxed">
                {[customer.address, customer.city].filter(Boolean).join("، ")}
                {customer.phone && (
                  <>
                    <br />
                    <span className="num">{customer.phone}</span>
                  </>
                )}
                {customer.taxNumber && (
                  <>
                    <br />
                    {t("label.taxNumber")}: <span className="num">{customer.taxNumber}</span>
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-4 print:block">
          <div className="lg:col-span-2 min-w-0 flex flex-col gap-4">
            <Card className="print:border-0">
              <div className="print:hidden">
                <CardHeader
                  title={t("label.description")}
                  meta={t("msg.rowsCount", { n: invoice.lines.length })}
                  action={
                    isDraft ? (
                      <Link
                        href={`/invoices/${invoice.id}/edit`}
                        className="text-2xs text-accent hover:underline"
                      >
                        {t("action.edit")}
                      </Link>
                    ) : undefined
                  }
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="hairline-b bg-sunken/60 print:bg-transparent text-2xs text-muted">
                      <th className="h-10 px-3 text-start font-medium w-8">#</th>
                      <th className="h-10 px-3 text-start font-medium">{t("label.name")}</th>
                      <th className="h-10 px-3 text-end font-medium w-16">{t("label.qty")}</th>
                      <th className="h-10 px-3 text-end font-medium w-28">
                        {t("label.unitPrice")}
                      </th>
                      <th className="h-10 px-3 text-end font-medium w-16">
                        {t("label.discount")}
                      </th>
                      <th className="h-10 px-3 text-end font-medium w-16">{t("label.tax")}</th>
                      <th className="h-10 px-3 text-end font-medium w-28">
                        {t("label.lineTotal")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.lines.map((line, index) => {
                      const meta = lineItems.find((l) => l.id === line.id);
                      const lineTotal = totals.lines[index];
                      return (
                        <tr key={line.id} className="hairline-b last:border-b-0">
                          <td className="h-11 px-3 text-faint">
                            <Num>{index + 1}</Num>
                          </td>
                          <td className="h-11 px-3">
                            {meta?.name ?? line.description}
                            {meta?.sku && (
                              <Num className="text-2xs text-faint ms-2">{meta.sku}</Num>
                            )}
                          </td>
                          <td className="h-11 px-3 text-end">
                            <Num>{formatNumber(line.qty, locale)}</Num>
                          </td>
                          <td className="h-11 px-3 text-end">
                            <Num>{money(line.unitPrice)}</Num>
                          </td>
                          <td className="h-11 px-3 text-end text-muted">
                            <Num>
                              {line.discountPercent ? `${line.discountPercent}%` : "—"}
                            </Num>
                          </td>
                          <td className="h-11 px-3 text-end text-muted">
                            <Num>{line.taxRate ? `${line.taxRate}%` : "—"}</Num>
                          </td>
                          <td className="h-11 px-3 text-end">
                            <Num className="font-medium">{money(lineTotal?.total ?? 0)}</Num>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totals sit under the lines on paper, where a sidebar cannot follow. */}
              <div className="flex justify-end p-3 hairline-t">
                <dl className="w-56 flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs">
                    <dt className="text-muted">{t("label.subtotal")}</dt>
                    <dd><Num>{money(totals.subtotal)}</Num></dd>
                  </div>
                  {totals.discount > 0 && (
                    <div className="flex justify-between text-xs">
                      <dt className="text-muted">{t("label.discount")}</dt>
                      <dd><Num>−{money(totals.discount)}</Num></dd>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <dt className="text-muted">{t("label.net")}</dt>
                    <dd><Num>{money(totals.net)}</Num></dd>
                  </div>
                  <div className="flex justify-between text-xs">
                    <dt className="text-muted">{t("label.tax")}</dt>
                    <dd><Num>{money(totals.tax)}</Num></dd>
                  </div>
                  <div className="flex justify-between pt-1.5 hairline-t">
                    <dt className="text-xs font-semibold">{t("label.total")}</dt>
                    <dd><Num className="text-sm font-semibold">{money(totals.total)}</Num></dd>
                  </div>
                  {invoice.currency !== base && (
                    <div className="flex justify-between text-2xs text-faint">
                      <dt>{base}</dt>
                      <dd><Num>{baseMoney(totalBase)}</Num></dd>
                    </div>
                  )}
                  {!isDraft && !isVoid && (
                    <>
                      <div className="flex justify-between text-xs">
                        <dt className="text-muted">{t("label.paid")}</dt>
                        <dd><Num className="text-accent">{baseMoney(paid)}</Num></dd>
                      </div>
                      <div className="flex justify-between text-xs">
                        <dt className="text-muted">{t("label.balance")}</dt>
                        <dd>
                          <Num className={outstanding > 0.005 ? "text-danger font-medium" : ""}>
                            {baseMoney(outstanding)}
                          </Num>
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
              </div>

              {invoice.notes && (
                <div className="px-3 pb-3">
                  <p className="text-2xs text-muted leading-relaxed">{invoice.notes}</p>
                </div>
              )}
            </Card>

            {/* Signature strip — paper only. */}
            <div className="hidden print:flex justify-between items-end pt-10">
              <p className="text-2xs text-muted">{t("print.thanks")}</p>
              <div className="text-2xs text-muted border-t border-line-strong pt-1 w-48 text-center">
                {t("print.signature")}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 no-print">
            <Card>
              <CardHeader title={t("label.description")} />
              <div className="px-3 py-1 divide-y divide-line">
                <DetailRow label={t("label.customer")}>
                  {customer ? (
                    <Link href={`/customers/${customer.id}`} className="hover:text-accent">
                      {customer.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </DetailRow>
                <DetailRow label={t("label.warehouse")}>{warehouseName}</DetailRow>
                <DetailRow label={t("label.date")}>
                  <Num>{formatDate(invoice.date, locale)}</Num>
                </DetailRow>
                <DetailRow label={t("label.dueDate")}>
                  <Num>{formatDate(invoice.dueDate, locale)}</Num>
                </DetailRow>
                <DetailRow label={t("label.currency")}>
                  <Num>
                    {invoice.currency}
                    {invoice.currency !== base ? ` · ${invoice.fxRate}` : ""}
                  </Num>
                </DetailRow>
                <DetailRow label={t("label.status")}>
                  <Badge tone={INVOICE_TONE[invoice.status]}>
                    {t(invoiceKey(invoice.status))}
                  </Badge>
                </DetailRow>
              </div>
            </Card>

            <Card>
              <CardHeader
                title={t("page.accounting.payments")}
                meta={String(payments.length)}
              />
              {payments.length === 0 ? (
                <EmptyState compact title={t("empty.payments")} />
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="hairline-b last:border-b-0">
                        <td className="h-10 px-3 text-muted w-24">
                          <Num className="text-2xs">{formatDate(p.date, locale)}</Num>
                        </td>
                        <td className="h-10 px-3">
                          {t(`method.${p.method}` as MessageKey)}
                          {p.reference && (
                            <Num className="text-2xs text-faint ms-2">{p.reference}</Num>
                          )}
                        </td>
                        <td className="h-10 px-3 text-end">
                          <Num className="text-accent font-medium">
                            {formatMoney(p.amount, p.currency, locale)}
                          </Num>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </div>
      </div>

      <Confirm
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() =>
          run(() =>
            confirming === "issue" ? issueInvoice(invoice.id) : voidInvoice(invoice.id),
          )
        }
        title={confirming === "issue" ? t("action.issue") : t("action.void")}
        message={
          error ?? (confirming === "issue" ? t("msg.confirmIssue") : t("msg.confirmVoid"))
        }
        confirmLabel={confirming === "issue" ? t("action.issue") : t("action.void")}
        tone={confirming === "issue" ? "primary" : "danger"}
        pending={pending}
      />

      <Modal
        open={paying}
        onClose={() => setPaying(false)}
        title={t("action.recordPayment")}
        description={invoice.number}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPaying(false)} disabled={pending}>
              {t("action.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={pending}
              onClick={() =>
                run(() =>
                  recordInvoicePayment({
                    invoiceId: invoice.id,
                    date: payForm.date,
                    amount: payForm.amount,
                    method: payForm.method,
                    reference: payForm.reference,
                    note: payForm.note,
                  }),
                )
              }
            >
              {t("action.save")}
            </Button>
          </>
        }
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t("label.date")}>
            <Input
              type="date"
              dir="ltr"
              value={payForm.date}
              onChange={(e) => setPayForm({ ...payForm, date: e.target.value })}
            />
          </Field>
          <Field
            label={`${t("label.amount")} (${invoice.currency})`}
            hint={`${t("label.balance")} ${baseMoney(outstanding)}`}
          >
            <NumberInput
              value={payForm.amount}
              min={0}
              step="0.01"
              onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })}
            />
          </Field>
          <Field label={t("label.method")}>
            <Select
              value={payForm.method}
              onChange={(e) =>
                setPayForm({ ...payForm, method: e.target.value as PaymentMethod })
              }
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`method.${m}` as MessageKey)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("label.reference")}>
            <Input
              value={payForm.reference}
              onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
            />
          </Field>
          <Field label={t("label.notes")} className="sm:col-span-2">
            <Input
              value={payForm.note}
              onChange={(e) => setPayForm({ ...payForm, note: e.target.value })}
            />
          </Field>
        </div>
        {error && <p className="text-2xs text-danger mt-3">{error}</p>}
      </Modal>
    </>
  );
}
