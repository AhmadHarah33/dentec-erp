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
  formatDate,
  formatMonth,
  isInMonth,
  lastMonths,
  today,
} from "@/lib/dates";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card, LinkButton, Num } from "@/components/ui/primitives";
import {
  KpiTile,
  DashCard,
  PeriodToggle,
  RankedList,
  AttentionCard,
  AttentionRow,
} from "@/components/ui/dashboard";
import { TrendBars } from "@/components/ui/dashboard-chart";
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
import { countedPhrase, type CountedNoun } from "@/lib/plural";

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
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale, t } = await getI18n();
  const role = await getViewRole();
  const db = await snapshot();
  const { baseCurrency } = db.settings;
  const { period } = await searchParams;
  const trendMonths = period === "6" ? 6 : 12;

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
  const trend = salesByMonth(db.salesInvoices, trendMonths);
  const yearTotal = trend.reduce((s, p) => s + p.sales, 0);
  const peakSales = Math.max(...trend.map((p) => p.sales), 0);
  const top = salesByItem(db).slice(0, 6);

    /** A counted phrase, digits and noun — see `src/lib/plural.ts`. */
  const counted = (noun: CountedNoun, n: number) => ({
    d: countedPhrase(locale, noun, n),
  });

const itemName = (item: { nameAr: string; nameTr: string }) =>
    locale === "tr" && item.nameTr ? item.nameTr : item.nameAr;
  const customerName = (id: string) => db.customers.find((c) => c.id === id)?.name ?? "—";

  /* ---- What this role leads with ---------------------------------- */

  const showMoney = role !== "service";

  const overdueTile = (
    <KpiTile
      key="overdue"
      label={t("dash.overdueAmount")}
      value={compact(overdueAmount)}
      icon={IconCoins}
      href="/accounting"
      tone={overdue.length > 0 ? "danger" : "success"}
      chip={overdue.length > 0 ? t("dash.tileBad") : t("dash.tileGood")}
      meta={overdue.length > 0 ? t("dash.oldestOverdue", counted("day", oldestOverdue)) : undefined}
    />
  );

  const lowStockTile = (
    <KpiTile
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
    <KpiTile
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
    <KpiTile
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
          <KpiTile
            key="recv"
            label={t("dash.receivables")}
            value={compact(receivables)}
            icon={IconDocument}
            href="/accounting"
            tone="accent"
          />,
          <KpiTile
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
            <KpiTile
              key="await"
              label={t("service.awaiting_parts")}
              value={count(awaitingParts)}
              icon={IconLayers}
              href="/service"
              tone={awaitingParts > 0 ? "warn" : "success"}
              chip={awaitingParts > 0 ? t("dash.tileWatch") : t("dash.tileGood")}
            />,
            lowStockTile,
            <KpiTile
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
    <AttentionCard
      key="overdue"
      title={t("dash.overdueInvoices")}
      count={overdue.length}
      href="/accounting"
      viewAllLabel={t("dash.viewAll")}
      emptyTitle={t("empty.none")}
    >
      {overdue.slice(0, 5).map((inv) => (
        <AttentionRow
          key={inv.id}
          href={"/invoices/" + inv.id}
          title={customerName(inv.customerId)}
          value={money(invoiceOutstanding(inv, db.payments))}
          valueTone="danger"
        />
      ))}
    </AttentionCard>
  );

  const lowList = (
    <AttentionCard
      key="low"
      title={t("dash.belowMinimum")}
      count={low.length}
      href="/inventory"
      viewAllLabel={t("dash.viewAll")}
      emptyTitle={t("empty.none")}
    >
      {low.slice(0, 5).map((row) => (
        <AttentionRow
          key={row.item.id}
          href="/inventory"
          title={itemName(row.item)}
          value={count(row.qty)}
          valueTone={row.health === "out" ? "danger" : "warn"}
        />
      ))}
    </AttentionCard>
  );

  const jobsList = (
    <AttentionCard
      key="jobs"
      title={t("dash.openJobs")}
      count={jobs.length}
      href="/service"
      viewAllLabel={t("dash.viewAll")}
      emptyTitle={t("empty.none")}
    >
      {jobs.slice(0, 5).map((job) => (
        <AttentionRow
          key={job.id}
          href={"/service/" + job.id}
          title={job.machineLabel || customerName(job.customerId)}
          status={t(serviceKey(job.status))}
          statusTone={SERVICE_TONE[job.status]}
        />
      ))}
    </AttentionCard>
  );

  const purchasesList = (
    <AttentionCard
      key="po"
      title={t("dash.pendingPurchases")}
      count={pendingPOs.length}
      href="/purchases"
      viewAllLabel={t("dash.viewAll")}
      emptyTitle={t("empty.none")}
    >
      {pendingPOs.slice(0, 5).map((po) => (
        <AttentionRow
          key={po.id}
          href={"/purchases/" + po.id}
          title={db.suppliers.find((s) => s.id === po.supplierId)?.name ?? "—"}
          value={money(purchaseTotalBase(po))}
        />
      ))}
    </AttentionCard>
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
        size="hero"
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger">{tiles}</div>

      <h2 className="text-sm font-semibold mb-4">{t("dash.needsAttention")}</h2>

      {nothingWaiting ? (
        <Card className="mb-8">
          <EmptyState title={t("dash.allClear")} hint={t("dash.allClearHint")} />
        </Card>
      ) : (
        <div className={"grid gap-4 mb-8 stagger " + listCols}>{lists.map((l) => l.node)}</div>
      )}

      {showMoney ? (
        <>
          <h2 className="text-sm font-semibold mb-4">{t("dash.performance")}</h2>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4 stagger">
            <KpiTile
              label={t("dash.salesThisMonth")}
              value={compact(monthSales)}
              delta={delta}
              meta={t("dash.fromInvoices", counted("invoice", monthInvoices.length))}
            />
            <KpiTile
              label={t("dash.receivables")}
              value={compact(receivables)}
              meta={t("dash.vsLastMonth")}
            />
            <KpiTile
              label={t("dash.stockValue")}
              value={compact(stockTotal)}
              meta={t("dash.atStandardCost")}
            />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <DashCard
              className="lg:col-span-2"
              title={t("dash.salesTrend")}
              action={
                <PeriodToggle
                  param="period"
                  value={trendMonths === 6 ? "6" : "12"}
                  ariaLabel={t("dash.salesTrend")}
                  options={[
                    { value: "6", label: t("dash.months6") },
                    { value: "12", label: t("dash.months12") },
                  ]}
                />
              }
            >
              {/* The card leads with the figure the shape is made of. */}
              <div className="flex items-baseline gap-2 mb-6">
                <Num className="text-2xl font-bold tracking-tight leading-none">
                  {compact(yearTotal)}
                </Num>
                <span className="text-2xs text-muted">{t("dash.periodTotal")}</span>
              </div>
              <TrendBars
                points={trend.map((p) => ({
                  label: formatMonth(p.month, locale),
                  value: p.sales,
                  meta: t("dash.fromInvoices", counted("invoice", p.count)),
                  highlight: p.month === thisMonth || (p.sales === peakSales && p.sales > 0),
                }))}
                currency={baseCurrency}
                locale={locale}
              />
            </DashCard>

            <DashCard title={t("dash.topItems")}>
              {top.length === 0 ? (
                <EmptyState compact title={t("empty.invoices")} />
              ) : (
                <RankedList
                  points={top.map((r) => ({
                    label: r.item ? itemName(r.item) : "—",
                    value: r.revenue,
                  }))}
                  currency={baseCurrency}
                  locale={locale}
                />
              )}
            </DashCard>
          </div>
        </>
      ) : (
        /* Service gets the stock picture where the money picture would be. */
        <>
          <h2 className="text-sm font-semibold mb-4">{t("dash.performance")}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 stagger">
            <KpiTile
              label={t("dash.stockValue")}
              value={compact(stockTotal)}
              meta={t("dash.atStandardCost")}
            />
            <KpiTile label={t("dash.pendingPurchases")} value={count(pendingPOs.length)} />
            <KpiTile label={t("service.delivered")} value={count(deliveredThisMonth)} />
          </div>
        </>
      )}
    </>
  );
}
