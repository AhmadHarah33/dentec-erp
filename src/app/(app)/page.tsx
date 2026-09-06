import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { getViewRole } from "@/lib/roles.server";
import { buildStockIndex, lowStock, stockValue } from "@/lib/stock";
import {
  invoiceOutstanding,
  invoiceTotalBase,
  isLive,
  overdueInvoices,
  openServiceJobs,
  paymentBase,
  purchaseTotalBase,
  salesByItem,
  salesByMonth,
  totalReceivables,
} from "@/lib/queries";
import { formatMoney, formatMoneyCompact, formatNumber } from "@/lib/money";
import {
  daysOverdue,
  daysBetween,
  formatDate,
  formatMonth,
  isInMonth,
  lastMonths,
  today,
} from "@/lib/dates";
import { PageHeader, StatTile, ListCard, ListRow, EmptyState } from "@/components/ui/page";
import { Card, CardHeader, LinkButton, Badge, Num } from "@/components/ui/primitives";
import { LineChart, BarList } from "@/components/ui/charts";
import {
  IconCart,
  IconCheck,
  IconCoins,
  IconDocument,
  IconLayers,
  IconPlus,
  IconWrench,
} from "@/components/ui/icons";
import { SERVICE_TONE, serviceKey } from "@/lib/labels";

/**
 * The dashboard is a queue, not a report.
 *
 * The tiles are the things that can be wrong, the middle band is the work
 * waiting on you — each row a link straight to the record that clears it —
 * and performance sits below, because "how was last month" is never the
 * question you open the app to answer.
 *
 * The view role reorders this and nothing else. Accounting leads with money
 * and drops the workshop; service leads with the workshop and drops revenue
 * figures it has no use for. No page is hidden either way: the role is a
 * preference, not a permission.
 */
export default async function DashboardPage() {
  const { locale, t } = await getI18n();
  const role = await getViewRole();
  const db = await snapshot();
  const { baseCurrency } = db.settings;

  const money = (n: number) => formatMoney(n, baseCurrency, locale);
  const compact = (n: number) => formatMoneyCompact(n, baseCurrency, locale);
  const count = (n: number) => formatNumber(n, locale, 0);

  const index = buildStockIndex(db.stockMoves);
  const months = lastMonths(12);
  const thisMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2];
  const now = today();

  /* ---- Attention -------------------------------------------------- */

  const overdue = overdueInvoices(db);
  const overdueAmount = overdue.reduce((s, i) => s + invoiceOutstanding(i, db.payments), 0);
  const oldestOverdue = overdue.length > 0 ? daysOverdue(overdue[0].dueDate) : 0;

  const low = lowStock(db.items, index);
  const outOfStock = low.filter((r) => r.health === "out").length;

  const jobs = openServiceJobs(db.serviceJobs);
  const awaitingParts = jobs.filter((j) => j.status === "awaiting_parts").length;
  const deliveredThisMonth = db.serviceJobs.filter(
    (j) => j.status === "delivered" && isInMonth(j.date, thisMonth),
  ).length;

  const pendingPOs = db.purchaseOrders.filter(
    (p) => p.status === "ordered" || p.status === "partial",
  );
  const pendingValue = pendingPOs.reduce((s, p) => s + purchaseTotalBase(p), 0);

  /* ---- Money ------------------------------------------------------ */

  const live = db.salesInvoices.filter(isLive);
  const monthInvoices = live.filter((i) => isInMonth(i.date, thisMonth));
  const monthSales = monthInvoices.reduce((s, i) => s + invoiceTotalBase(i), 0);
  const prevSales = live
    .filter((i) => isInMonth(i.date, prevMonth))
    .reduce((s, i) => s + invoiceTotalBase(i), 0);
  const delta = prevSales > 0 ? ((monthSales - prevSales) / prevSales) * 100 : undefined;

  const collected = db.payments
    .filter((p) => p.direction === "in" && isInMonth(p.date, thisMonth))
    .reduce((s, p) => s + paymentBase(p), 0);

  const receivables = totalReceivables(db);
  const stockTotal = stockValue(db.items, index);
  const trend = salesByMonth(db.salesInvoices, 12);
  const yearTotal = trend.reduce((s, p) => s + p.sales, 0);
  const top = salesByItem(db).slice(0, 6);

  const itemName = (item: { nameAr: string; nameTr: string }) =>
    locale === "tr" && item.nameTr ? item.nameTr : item.nameAr;
  const customerName = (id: string) => db.customers.find((c) => c.id === id)?.name ?? "—";

  /* ---- What this role leads with ---------------------------------- */

  const showMoney = role !== "service";

  const overdueTile = (
    <StatTile
      key="overdue"
      label={t("dash.overdueAmount")}
      value={compact(overdueAmount)}
      icon={IconCoins}
      href="/accounting"
      tone={overdue.length > 0 ? "danger" : "success"}
      chip={overdue.length > 0 ? t("dash.tileBad") : t("dash.tileGood")}
      meta={overdue.length > 0 ? t("dash.oldestOverdue", { n: oldestOverdue }) : undefined}
    />
  );

  const lowStockTile = (
    <StatTile
      key="low"
      label={t("dash.belowMinimum")}
      value={count(low.length)}
      icon={IconLayers}
      href="/inventory"
      tone={outOfStock > 0 ? "danger" : low.length > 0 ? "warn" : "success"}
      chip={
        outOfStock > 0
          ? t("dash.tileCritical")
          : low.length > 0
            ? t("dash.tileWatch")
            : t("dash.tileGood")
      }
      meta={outOfStock > 0 ? t("dash.outOfStock", { n: outOfStock }) : undefined}
    />
  );

  const jobsTile = (
    <StatTile
      key="jobs"
      label={t("dash.openJobsCount")}
      value={count(jobs.length)}
      icon={IconWrench}
      href="/service"
      tone={awaitingParts > 0 ? "warn" : jobs.length > 0 ? "accent" : "success"}
      chip={
        awaitingParts > 0
          ? t("dash.tileWatch")
          : jobs.length === 0
            ? t("dash.tileGood")
            : undefined
      }
      meta={awaitingParts > 0 ? t("dash.awaitingParts", { n: awaitingParts }) : undefined}
    />
  );

  const purchasesTile = (
    <StatTile
      key="po"
      label={t("dash.pendingPurchases")}
      value={count(pendingPOs.length)}
      icon={IconCart}
      href="/purchases"
      tone={pendingPOs.length > 0 ? "accent" : "success"}
      chip={pendingPOs.length === 0 ? t("dash.tileGood") : undefined}
      meta={
        pendingPOs.length > 0 ? t("dash.pendingValue", { v: compact(pendingValue) }) : undefined
      }
    />
  );

  const tiles =
    role === "accounting"
      ? [
          overdueTile,
          <StatTile
            key="recv"
            label={t("dash.receivables")}
            value={compact(receivables)}
            icon={IconDocument}
            href="/accounting"
            tone="accent"
          />,
          <StatTile
            key="cash"
            label={t("page.accounting.cashIn")}
            value={compact(collected)}
            icon={IconCoins}
            href="/accounting"
            tone="success"
            meta={t("report.thisMonth")}
          />,
          purchasesTile,
        ]
      : role === "service"
        ? [
            jobsTile,
            <StatTile
              key="await"
              label={t("service.awaiting_parts")}
              value={count(awaitingParts)}
              icon={IconLayers}
              href="/service"
              tone={awaitingParts > 0 ? "warn" : "success"}
              chip={awaitingParts > 0 ? t("dash.tileWatch") : t("dash.tileGood")}
            />,
            lowStockTile,
            <StatTile
              key="done"
              label={t("service.delivered")}
              value={count(deliveredThisMonth)}
              icon={IconCheck}
              href="/service"
              tone="success"
              meta={t("report.thisMonth")}
            />,
          ]
        : [overdueTile, lowStockTile, jobsTile, purchasesTile];

  const overdueList = (
    <ListCard
      key="overdue"
      title={t("dash.overdueInvoices")}
      icon={IconDocument}
      tone="danger"
      count={overdue.length}
      href="/accounting"
      viewAllLabel={t("dash.viewAll")}
      emptyTitle={t("empty.none")}
    >
      {overdue.slice(0, 5).map((inv) => (
        <ListRow
          key={inv.id}
          href={"/invoices/" + inv.id}
          title={customerName(inv.customerId)}
          subtitle={t("dash.daysLate", { n: daysOverdue(inv.dueDate) })}
          value={money(invoiceOutstanding(inv, db.payments))}
          valueTone="danger"
        />
      ))}
    </ListCard>
  );

  const lowList = (
    <ListCard
      key="low"
      title={t("dash.belowMinimum")}
      icon={IconLayers}
      tone={outOfStock > 0 ? "danger" : "warn"}
      count={low.length}
      href="/inventory"
      viewAllLabel={t("dash.viewAll")}
      emptyTitle={t("empty.none")}
    >
      {low.slice(0, 5).map((row) => (
        <ListRow
          key={row.item.id}
          href="/inventory"
          title={itemName(row.item)}
          subtitle={row.item.sku}
          badge={
            <Badge tone={row.health === "out" ? "danger" : "warn"}>
              {t(row.health === "out" ? "health.out" : "health.low")}
            </Badge>
          }
          value={count(row.qty)}
          valueTone={row.health === "out" ? "danger" : "warn"}
        />
      ))}
    </ListCard>
  );

  const jobsList = (
    <ListCard
      key="jobs"
      title={t("dash.openJobs")}
      icon={IconWrench}
      tone={awaitingParts > 0 ? "warn" : "accent"}
      count={jobs.length}
      href="/service"
      viewAllLabel={t("dash.viewAll")}
      emptyTitle={t("empty.none")}
    >
      {jobs.slice(0, 5).map((job) => (
        <ListRow
          key={job.id}
          href={"/service/" + job.id}
          title={job.machineLabel || customerName(job.customerId)}
          subtitle={t("dash.daysOpen", { n: daysBetween(job.date, now) })}
          badge={<Badge tone={SERVICE_TONE[job.status]}>{t(serviceKey(job.status))}</Badge>}
        />
      ))}
    </ListCard>
  );

  const purchasesList = (
    <ListCard
      key="po"
      title={t("dash.pendingPurchases")}
      icon={IconCart}
      tone="accent"
      count={pendingPOs.length}
      href="/purchases"
      viewAllLabel={t("dash.viewAll")}
      emptyTitle={t("empty.none")}
    >
      {pendingPOs.slice(0, 5).map((po) => (
        <ListRow
          key={po.id}
          href={"/purchases/" + po.id}
          title={db.suppliers.find((s) => s.id === po.supplierId)?.name ?? "—"}
          subtitle={formatDate(po.expectedDate, locale)}
          value={money(purchaseTotalBase(po))}
        />
      ))}
    </ListCard>
  );

  const lists =
    role === "accounting"
      ? [
          { node: overdueList, empty: overdue.length === 0 },
          { node: purchasesList, empty: pendingPOs.length === 0 },
        ]
      : role === "service"
        ? [
            { node: jobsList, empty: jobs.length === 0 },
            { node: lowList, empty: low.length === 0 },
          ]
        : [
            { node: overdueList, empty: overdue.length === 0 },
            { node: lowList, empty: low.length === 0 },
            { node: jobsList, empty: jobs.length === 0 },
          ];

  const nothingWaiting = lists.every((l) => l.empty);
  const listCols = lists.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3";

  return (
    <>
      <PageHeader
        title={t("dash.greeting")}
        subtitle={formatDate(now, locale)}
        actions={
          <>
            {role === "service" ? (
              <LinkButton href="/service" variant="primary">
                <IconPlus />
                {t("dash.newJob")}
              </LinkButton>
            ) : (
              <LinkButton href="/invoices/new" variant="primary">
                <IconPlus />
                {t("dash.newInvoice")}
              </LinkButton>
            )}
            {/* cn() is a plain join, so a `hidden` utility on LinkButton would
                lose to the `inline-flex` in its base class. Wrap instead. */}
            <span className="hidden sm:flex items-center gap-2">
              {role === "accounting" && (
                <LinkButton href="/accounting">{t("page.accounting.newPayment")}</LinkButton>
              )}
              {role !== "accounting" && (
                <LinkButton href="/purchases/new">{t("dash.newPurchase")}</LinkButton>
              )}
              {role === "owner" && <LinkButton href="/service">{t("dash.newJob")}</LinkButton>}
            </span>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">{tiles}</div>

      <h2 className="text-sm font-semibold mb-4">{t("dash.needsAttention")}</h2>

      {nothingWaiting ? (
        <Card className="mb-8">
          <EmptyState title={t("dash.allClear")} hint={t("dash.allClearHint")} />
        </Card>
      ) : (
        <div className={"grid gap-4 mb-8 " + listCols}>{lists.map((l) => l.node)}</div>
      )}

      {showMoney ? (
        <>
          <h2 className="text-sm font-semibold mb-4">{t("dash.performance")}</h2>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <StatTile
              label={t("dash.salesThisMonth")}
              value={compact(monthSales)}
              delta={delta}
              meta={t("dash.fromInvoices", { n: monthInvoices.length })}
            />
            <StatTile
              label={t("dash.receivables")}
              value={compact(receivables)}
              meta={t("dash.vsLastMonth")}
            />
            <StatTile
              label={t("dash.stockValue")}
              value={compact(stockTotal)}
              meta={t("dash.atStandardCost")}
            />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader title={t("dash.salesTrend")} meta={t("dash.lastMonths")} />
              <div className="p-4">
                {/* The card leads with the figure the shape is made of. */}
                <div className="flex items-baseline gap-2 mb-5">
                  <Num className="text-2xl font-bold tracking-tight leading-none">
                    {compact(yearTotal)}
                  </Num>
                  <span className="text-2xs text-muted">{t("dash.periodTotal")}</span>
                </div>
                <LineChart
                  points={trend.map((p) => ({
                    label: formatMonth(p.month, locale),
                    value: p.sales,
                    meta: t("dash.fromInvoices", { n: p.count }),
                  }))}
                  currency={baseCurrency}
                  locale={locale}
                />
              </div>
            </Card>

            <Card>
              <CardHeader title={t("dash.topItems")} />
              <div className="p-4">
                {top.length === 0 ? (
                  <EmptyState compact title={t("empty.invoices")} />
                ) : (
                  <BarList
                    points={top.map((r) => ({
                      label: r.item ? itemName(r.item) : "—",
                      value: r.revenue,
                    }))}
                    currency={baseCurrency}
                    locale={locale}
                  />
                )}
              </div>
            </Card>
          </div>
        </>
      ) : (
        /* Service gets the stock picture where the money picture would be. */
        <>
          <h2 className="text-sm font-semibold mb-4">{t("dash.performance")}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatTile
              label={t("dash.stockValue")}
              value={compact(stockTotal)}
              meta={t("dash.atStandardCost")}
            />
            <StatTile label={t("dash.pendingPurchases")} value={count(pendingPOs.length)} />
            <StatTile label={t("service.delivered")} value={count(deliveredThisMonth)} />
          </div>
        </>
      )}
    </>
  );
}
