import Link from "next/link";
import { notFound } from "next/navigation";
import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import {
  supplierBalance,
  purchaseTotalBase,
  paymentBase,
} from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { PURCHASE_TONE, purchaseKey } from "@/lib/labels";
import { PageHeader, StatTile, DetailRow, EmptyState } from "@/components/ui/page";
import { Badge, Card, CardHeader, Num, LinkButton } from "@/components/ui/primitives";
import { IconCart, IconChart, IconCheck, IconCoins } from "@/components/ui/icons";
import type { MessageKey } from "@/lib/i18n";

export default async function SupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { locale, t } = await getI18n();
  const db = await snapshot();

  const supplier = db.suppliers.find((s) => s.id === id);
  if (!supplier) notFound();

  const currency = db.settings.baseCurrency;
  const money = (n: number) => formatMoney(n, currency, locale);

  const orders = db.purchaseOrders
    .filter((o) => o.supplierId === id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const payments = db.payments
    .filter((p) => p.partyType === "supplier" && p.partyId === id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const balance = supplierBalance(id, db.purchaseOrders, db.payments);
  const totalPurchased = orders
    .filter((o) => o.status !== "draft" && o.status !== "cancelled")
    .reduce((s, o) => s + purchaseTotalBase(o), 0);
  const totalPaid = payments
    .filter((p) => p.direction === "out")
    .reduce((s, p) => s + paymentBase(p), 0);

  return (
    <>
      <PageHeader
        title={supplier.name}
        subtitle={`${supplier.code} · ${t(`kind.${supplier.kind}` as MessageKey)}`}
        actions={
          <>
            <LinkButton href="/suppliers">{t("action.back")}</LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatTile
          label={t("label.balance")}
          value={money(balance)}
          icon={IconCoins}
          tone={balance > 0.005 ? "warn" : "success"}
        />
        <StatTile label={t("label.amount")} value={money(totalPurchased)} icon={IconChart} />
        <StatTile
          label={t("label.paid")}
          value={money(totalPaid)}
          icon={IconCheck}
          tone="success"
        />
        <StatTile label={t("nav.purchases")} value={String(orders.length)} icon={IconCart} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1 h-fit">
          <CardHeader title={t("label.company")} />
          <div className="px-3 py-1 divide-y divide-line">
            <DetailRow label={t("label.contactPerson")}>
              {supplier.contactPerson || "—"}
            </DetailRow>
            <DetailRow label={t("label.phone")}>
              <Num>{supplier.phone || "—"}</Num>
            </DetailRow>
            <DetailRow label={t("label.email")}>
              <span dir="ltr">{supplier.email || "—"}</span>
            </DetailRow>
            <DetailRow label={t("label.city")}>{supplier.city || "—"}</DetailRow>
            <DetailRow label={t("label.address")}>{supplier.address || "—"}</DetailRow>
            <DetailRow label={t("label.taxNumber")}>
              <Num>{supplier.taxNumber || "—"}</Num>
            </DetailRow>
            <DetailRow label={t("label.status")}>
              <Badge tone={supplier.active ? "accent" : "muted"}>
                {t(supplier.active ? "label.active" : "label.inactive")}
              </Badge>
            </DetailRow>
          </div>
          {supplier.notes && (
            <div className="px-3 py-2 hairline-t">
              <p className="text-2xs text-muted leading-relaxed">{supplier.notes}</p>
            </div>
          )}
        </Card>

        <div className="lg:col-span-2 min-w-0 flex flex-col gap-4">
          <Card>
            <CardHeader title={t("nav.purchases")} meta={String(orders.length)} />
            {orders.length === 0 ? (
              <EmptyState compact title={t("empty.purchases")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="hairline-b bg-sunken/60 text-2xs text-muted">
                      <th className="h-10 px-3 text-start font-medium">{t("label.number")}</th>
                      <th className="h-10 px-3 text-start font-medium">{t("label.date")}</th>
                      <th className="h-10 px-3 text-start font-medium">{t("label.status")}</th>
                      <th className="h-10 px-3 text-end font-medium">{t("label.total")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 20).map((order) => (
                      <tr key={order.id} className="hairline-b last:border-b-0">
                        <td className="h-10 px-3">
                          <Link href={`/purchases/${order.id}`} className="num hover:text-accent">
                            {order.number}
                          </Link>
                        </td>
                        <td className="h-10 px-3 text-muted">
                          <Num className="text-2xs">{formatDate(order.date, locale)}</Num>
                        </td>
                        <td className="h-10 px-3">
                          <Badge tone={PURCHASE_TONE[order.status]}>
                            {t(purchaseKey(order.status))}
                          </Badge>
                        </td>
                        <td className="h-10 px-3 text-end">
                          <Num>{money(purchaseTotalBase(order))}</Num>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
