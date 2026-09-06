import Link from "next/link";
import { notFound } from "next/navigation";
import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import {
  customerBalance,
  invoiceOutstanding,
  invoiceTotalBase,
  isLive,
  paymentBase,
} from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { INVOICE_TONE, SERVICE_TONE, invoiceKey, serviceKey } from "@/lib/labels";
import { PageHeader, StatTile, DetailRow, EmptyState } from "@/components/ui/page";
import { Badge, Card, CardHeader, Num, LinkButton } from "@/components/ui/primitives";
import { IconCoins, IconChart, IconCheck, IconDocument } from "@/components/ui/icons";
import type { MessageKey } from "@/lib/i18n";

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { locale, t } = await getI18n();
  const db = await snapshot();

  const customer = db.customers.find((c) => c.id === id);
  if (!customer) notFound();

  const currency = db.settings.baseCurrency;
  const money = (n: number) => formatMoney(n, currency, locale);

  const invoices = db.salesInvoices
    .filter((i) => i.customerId === id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const jobs = db.serviceJobs
    .filter((j) => j.customerId === id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const payments = db.payments
    .filter((p) => p.partyType === "customer" && p.partyId === id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const balance = customerBalance(id, db.salesInvoices, db.payments);
  const billed = invoices.filter(isLive).reduce((s, i) => s + invoiceTotalBase(i), 0);
  const received = payments.reduce((s, p) => s + paymentBase(p), 0);
  const overLimit = customer.creditLimit > 0 && balance > customer.creditLimit;

  return (
    <>
      <PageHeader
        title={customer.name}
        subtitle={`${customer.code} · ${t(`kind.${customer.kind}` as MessageKey)}`}
        actions={
          <>
            <LinkButton href="/customers">{t("action.back")}</LinkButton>
            <LinkButton href={`/invoices/new?customer=${customer.id}`} variant="primary">
              {t("page.invoices.new")}
            </LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatTile
          label={t("label.balance")}
          value={money(balance)}
          icon={IconCoins}
          tone={overLimit ? "danger" : balance > 0.005 ? "accent" : "success"}
          chip={overLimit ? t("dash.tileBad") : undefined}
          meta={
            customer.creditLimit > 0
              ? `${t("label.creditLimit")} ${money(customer.creditLimit)}`
              : undefined
          }
        />
        <StatTile label={t("report.revenue")} value={money(billed)} icon={IconChart} />
        <StatTile
          label={t("label.paid")}
          value={money(received)}
          icon={IconCheck}
          tone="success"
        />
        <StatTile
          label={t("nav.invoices")}
          value={String(invoices.length)}
          icon={IconDocument}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1 h-fit">
          <CardHeader title={t("label.company")} />
          <div className="px-3 py-1 divide-y divide-line">
            <DetailRow label={t("label.contactPerson")}>
              {customer.contactPerson || "—"}
            </DetailRow>
            <DetailRow label={t("label.phone")}>
              <Num>{customer.phone || "—"}</Num>
            </DetailRow>
            <DetailRow label={t("label.email")}>
              <span dir="ltr">{customer.email || "—"}</span>
            </DetailRow>
            <DetailRow label={t("label.city")}>{customer.city || "—"}</DetailRow>
            <DetailRow label={t("label.address")}>{customer.address || "—"}</DetailRow>
            <DetailRow label={t("label.taxNumber")}>
              <Num>{customer.taxNumber || "—"}</Num>
            </DetailRow>
            <DetailRow label={t("label.status")}>
              <Badge tone={customer.active ? "accent" : "muted"}>
                {t(customer.active ? "label.active" : "label.inactive")}
              </Badge>
            </DetailRow>
          </div>
          {customer.notes && (
            <div className="px-3 py-2 hairline-t">
              <p className="text-2xs text-muted leading-relaxed">{customer.notes}</p>
            </div>
          )}
        </Card>

        <div className="lg:col-span-2 min-w-0 flex flex-col gap-4">
          <Card>
            <CardHeader title={t("nav.invoices")} meta={String(invoices.length)} />
            {invoices.length === 0 ? (
              <EmptyState compact title={t("empty.invoices")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="hairline-b bg-sunken/60 text-2xs text-muted">
                      <th className="h-10 px-3 text-start font-medium">{t("label.number")}</th>
                      <th className="h-10 px-3 text-start font-medium">{t("label.date")}</th>
                      <th className="h-10 px-3 text-start font-medium">{t("label.status")}</th>
                      <th className="h-10 px-3 text-end font-medium">{t("label.total")}</th>
                      <th className="h-10 px-3 text-end font-medium">{t("label.balance")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.slice(0, 20).map((inv) => (
                      <tr key={inv.id} className="hairline-b last:border-b-0">
                        <td className="h-10 px-3">
                          <Link href={`/invoices/${inv.id}`} className="num hover:text-accent">
                            {inv.number}
                          </Link>
                        </td>
                        <td className="h-10 px-3 text-muted">
                          <Num className="text-2xs">{formatDate(inv.date, locale)}</Num>
                        </td>
                        <td className="h-10 px-3">
                          <Badge tone={INVOICE_TONE[inv.status]}>
                            {t(invoiceKey(inv.status))}
                          </Badge>
                        </td>
                        <td className="h-10 px-3 text-end">
                          <Num>{money(invoiceTotalBase(inv))}</Num>
                        </td>
                        <td className="h-10 px-3 text-end">
                          <Num
                            className={
                              invoiceOutstanding(inv, db.payments) > 0.005
                                ? "text-danger font-medium"
                                : "text-faint"
                            }
                          >
                            {money(invoiceOutstanding(inv, db.payments))}
                          </Num>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title={t("nav.service")} meta={String(jobs.length)} />
            {jobs.length === 0 ? (
              <EmptyState compact title={t("empty.service")} />
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {jobs.slice(0, 10).map((job) => (
                    <tr key={job.id} className="hairline-b last:border-b-0">
                      <td className="h-10 px-3 w-28">
                        <Link href={`/service/${job.id}`} className="num hover:text-accent">
                          {job.number}
                        </Link>
                      </td>
                      <td className="h-10 px-3 truncate max-w-0">{job.machineLabel || "—"}</td>
                      <td className="h-10 px-3 text-muted w-24">
                        <Num className="text-2xs">{formatDate(job.date, locale)}</Num>
                      </td>
                      <td className="h-10 px-3 text-end w-32">
                        <Badge tone={SERVICE_TONE[job.status]}>{t(serviceKey(job.status))}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <CardHeader title={t("page.accounting.payments")} meta={String(payments.length)} />
            {payments.length === 0 ? (
              <EmptyState compact title={t("empty.payments")} />
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {payments.slice(0, 10).map((p) => (
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
                      <td className="h-10 px-3 text-end w-32">
                        <Num className="text-accent font-medium">{money(paymentBase(p))}</Num>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
