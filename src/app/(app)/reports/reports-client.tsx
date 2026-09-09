"use client";

import { useState, useMemo } from "react";
import type { CurrencyCode, Customer, Item, SalesInvoice } from "@/lib/data/types";
import { useT } from "@/lib/i18n/context";
import { formatMoney, formatMoneyCompact, formatNumber, round2 } from "@/lib/money";
import { IconChart, IconCoins, IconDocument } from "@/components/ui/icons";
import { formatMonth, today, daysBetween, addDays } from "@/lib/dates";
import { salesByMonth, salesByItem, salesByCustomer, invoiceTotalBase, isLive } from "@/lib/queries";
import { localName } from "@/lib/labels";
import { PageHeader, StatTile, Toolbar, EmptyState } from "@/components/ui/page";
import {
  Card,
  CardHeader,
  Input,
  Segmented,
  Num,
} from "@/components/ui/primitives";
import { LineChart, BarList } from "@/components/ui/charts";
import { IconCart } from "@/components/ui/icons";
import type { MessageKey } from "@/lib/i18n";
import { countedPhrase } from "@/lib/plural";
import type { Locale } from "@/lib/i18n";

interface ReportsClientProps {
  invoices: SalesInvoice[];
  items: Item[];
  customers: Customer[];
  stock: Record<string, number>;
  lastMoveDate: Record<string, string>;
  currency: CurrencyCode;
  locale: Locale;
}

type QuickRange = "thisMonth" | "last3Months" | "thisYear" | "allTime";

export function ReportsClient({
  invoices,
  items,
  customers,
  stock,
  lastMoveDate,
  currency,
  locale,
}: ReportsClientProps) {
  const t = useT();
  const money = (n: number) => formatMoney(n, currency, locale);
  const fmt = (n: number, decimals = 2) => formatNumber(n, locale, decimals);

  const today_ = today();
  const [fromDate, setFromDate] = useState<string>(() => {
    // Default to last 3 months
    return addDays(today_, -90);
  });
  const [toDate, setToDate] = useState<string>(today_);
  const [quickRange, setQuickRange] = useState<QuickRange>("last3Months");

  // Handle quick range changes
  const handleQuickRange = (range: QuickRange) => {
    setQuickRange(range);
    const to = today_;
    let from = to;
    switch (range) {
      case "thisMonth":
        from = to.slice(0, 7) + "-01";
        break;
      case "last3Months":
        from = addDays(to, -90);
        break;
      case "thisYear":
        from = to.slice(0, 4) + "-01-01";
        break;
      case "allTime":
        from = "1900-01-01";
        break;
    }
    setFromDate(from);
    setToDate(to);
  };

  // Filter invoices by date range
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (!isLive(inv)) return false;
      if (inv.date < fromDate || inv.date > toDate) return false;
      return true;
    });
  }, [invoices, fromDate, toDate]);

  // Compute aggregates from filtered invoices
  const salesData = useMemo(() => {
    const months = salesByMonth(filteredInvoices, 12);
    // Create a minimal DB-like object for the query functions
    const filteredDb = {
      salesInvoices: filteredInvoices,
      items,
      customers,
      payments: [], // Empty for these queries since we're just aggregating
    } as any;
    const items_ = salesByItem(filteredDb);
    const customers_ = salesByCustomer(filteredDb);

    const totalRevenue = round2(
      filteredInvoices.reduce((s, i) => s + invoiceTotalBase(i), 0),
    );
    const totalCost = round2(
      items_.reduce((s, row) => s + row.cost, 0),
    );
    const totalProfit = round2(totalRevenue - totalCost);
    const grossMargin =
      totalRevenue > 0 ? round2((totalProfit / totalRevenue) * 100) : 0;

    return {
      months,
      items: items_,
      customers: customers_,
      totalRevenue,
      totalCost,
      totalProfit,
      grossMargin,
      invoiceCount: filteredInvoices.length,
      avgInvoice: filteredInvoices.length > 0
        ? round2(totalRevenue / filteredInvoices.length)
        : 0,
    };
  }, [filteredInvoices, items, customers]);

  // Stock valuation: all items with stock, sorted by value descending
  const stockValuation = useMemo(() => {
    return items
      .map((item) => {
        const qty = stock[item.id] ?? 0;
        const value = round2(qty * item.cost);
        return { item, qty, value };
      })
      .filter((r) => r.qty > 0)
      .sort((a, b) => b.value - a.value);
  }, [items, stock]);

  // Slow movers: items with stock that haven't moved in 90+ days
  const slowMovers = useMemo(() => {
    const ninetyDaysAgo = addDays(today_, -90);
    return items
      .filter((item) => {
        const qty = stock[item.id] ?? 0;
        if (qty <= 0) return false;
        const lastMove = lastMoveDate[item.id];
        if (!lastMove) return true; // Never moved
        return lastMove < ninetyDaysAgo;
      })
      .map((item) => {
        const qty = stock[item.id] ?? 0;
        const lastMove = lastMoveDate[item.id] ?? "1900-01-01";
        const days = daysBetween(lastMove, today_);
        const value = round2(qty * item.cost);
        return { item, qty, value, days };
      })
      .sort((a, b) => b.days - a.days);
  }, [items, stock, lastMoveDate]);

  return (
    <>
      <PageHeader
        title={t("page.reports.title")}
        subtitle={t("page.reports.subtitle")}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile
          label={t("report.revenue")}
          value={formatMoneyCompact(salesData.totalRevenue, currency, locale)}
          icon={IconCoins}
          tone="success"
        />
        <StatTile
          label={t("report.grossProfit")}
          value={formatMoneyCompact(salesData.totalProfit, currency, locale)}
          icon={IconChart}
          meta={`${fmt(salesData.grossMargin, 1)}%`}
          tone={salesData.totalProfit > 0 ? "success" : "danger"}
          chip={salesData.totalProfit > 0 ? t("dash.tileGood") : t("dash.tileBad")}
        />
        <StatTile
          label={t("page.invoices.title")}
          value={fmt(salesData.invoiceCount, 0)}
          icon={IconDocument}
        />
        <StatTile
          label={t("report.avgInvoice")}
          value={formatMoneyCompact(salesData.avgInvoice, currency, locale)}
          icon={IconCart}
        />
      </div>

      <Toolbar>
        {/* Four mutually exclusive ranges, and the current one should stay
            visible — that is a segmented control, not a dropdown. */}
        <Segmented<QuickRange>
          value={quickRange}
          onChange={handleQuickRange}
          ariaLabel={t("action.filter")}
          options={[
            { value: "thisMonth", label: t("report.thisMonth" as MessageKey) },
            { value: "last3Months", label: t("report.last3Months" as MessageKey) },
            { value: "thisYear", label: t("report.thisYear" as MessageKey) },
            { value: "allTime", label: t("report.allTime" as MessageKey) },
          ]}
        />
        <div className="flex items-center gap-2 ms-auto">
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            dir="ltr"
            aria-label={t("label.date")}
            className="w-36"
          />
          <span className="text-faint text-2xs shrink-0">–</span>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            dir="ltr"
            aria-label={t("label.dueDate")}
            className="w-36"
          />
        </div>
      </Toolbar>

      <div className="flex flex-col gap-5">
      {/* 1. Sales by Month */}
      <Card>
        <CardHeader title={t("report.salesByMonth")} />
        <div className="p-3">
          {salesData.months.length === 0 ? (
            <EmptyState compact title={t("empty.invoices")} />
          ) : (
            <LineChart
              points={salesData.months.map((p) => ({
                label: formatMonth(p.month, locale),
                value: p.sales,
                meta: t("dash.fromInvoices", { d: countedPhrase(locale, "invoice", p.count) }),
              }))}
              currency={currency}
              locale={locale}
            />
          )}
        </div>
      </Card>

      {/* 2. Sales by Item */}
      <Card>
        <CardHeader title={t("report.salesByItem")} />
        <div className="overflow-x-auto">
          {salesData.items.length === 0 ? (
            <EmptyState compact title={t("empty.invoices")} />
          ) : (
            <table className="w-full text-xs">
              <thead className="hairline-b bg-sunken/60 text-2xs text-muted h-10">
                <tr>
                  <th className="px-3 text-start font-medium">
                    {t("label.name")}
                  </th>
                  <th className="px-3 text-start font-medium w-20">
                    {t("label.sku")}
                  </th>
                  <th className="px-3 text-end font-medium w-16">
                    {t("report.unitsSold")}
                  </th>
                  <th className="px-3 text-end font-medium w-24">
                    {t("report.revenue")}
                  </th>
                  <th className="px-3 text-end font-medium w-20">
                    {t("label.cost")}
                  </th>
                  <th className="px-3 text-end font-medium w-20">
                    {t("report.grossProfit")}
                  </th>
                  <th className="px-3 text-end font-medium w-16">
                    {t("label.margin")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {salesData.items.slice(0, 15).map((row) => {
                  const margin =
                    row.revenue > 0
                      ? round2((row.profit / row.revenue) * 100)
                      : 0;
                  return (
                    <tr
                      key={row.itemId}
                      className="hairline-b last:border-b-0 h-11"
                    >
                      <td className="px-3">
                        {row.item ? localName(row.item, locale) : "—"}
                      </td>
                      <td className="px-3 text-muted">
                        <span className="text-2xs">
                          {row.item?.sku ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 text-end">
                        <Num>{fmt(row.units, 0)}</Num>
                      </td>
                      <td className="px-3 text-end">
                        <Num>{money(row.revenue)}</Num>
                      </td>
                      <td className="px-3 text-end">
                        <Num>{money(row.cost)}</Num>
                      </td>
                      <td
                        className={`px-3 text-end ${
                          row.profit > 0
                            ? "text-accent"
                            : row.profit < 0
                              ? "text-danger"
                              : ""
                        }`}
                      >
                        <Num>{money(row.profit)}</Num>
                      </td>
                      <td className="px-3 text-end">
                        <Num>{fmt(margin, 1)}%</Num>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="hairline-t bg-sunken/60 h-11">
                <tr>
                  <td className="px-3 font-semibold">
                    {t("label.total")}
                  </td>
                  <td colSpan={2} />
                  <td className="px-3 text-end font-semibold">
                    <Num>
                      {fmt(
                        salesData.items
                          .slice(0, 15)
                          .reduce((s, r) => s + r.units, 0),
                        0,
                      )}
                    </Num>
                  </td>
                  <td className="px-3 text-end font-semibold">
                    <Num>
                      {money(
                        salesData.items.slice(0, 15).reduce((s, r) => s + r.revenue, 0),
                      )}
                    </Num>
                  </td>
                  <td className="px-3 text-end font-semibold">
                    <Num>
                      {money(
                        salesData.items.slice(0, 15).reduce((s, r) => s + r.cost, 0),
                      )}
                    </Num>
                  </td>
                  <td className="px-3 text-end font-semibold">
                    <Num>
                      {money(
                        salesData.items.slice(0, 15).reduce((s, r) => s + r.profit, 0),
                      )}
                    </Num>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </Card>

      {/* 3. Sales by Customer */}
      <Card>
        <CardHeader title={t("report.salesByCustomer")} />
        <div className="p-3">
          {salesData.customers.length === 0 ? (
            <EmptyState compact title={t("empty.invoices")} />
          ) : (
            <>
              <BarList
                points={salesData.customers.slice(0, 8).map((r) => ({
                  label: r.name,
                  value: r.revenue,
                }))}
                currency={currency}
                locale={locale}
              />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="hairline-b bg-sunken/60 text-2xs text-muted h-10">
                    <tr>
                      <th className="px-3 text-start font-medium">
                        {t("label.customer")}
                      </th>
                      <th className="px-3 text-end font-medium w-20">
                        {t("page.invoices.title")}
                      </th>
                      <th className="px-3 text-end font-medium w-24">
                        {t("report.revenue")}
                      </th>
                      <th className="px-3 text-end font-medium w-20">
                        %
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesData.customers.slice(0, 8).map((row) => {
                      const share =
                        salesData.totalRevenue > 0
                          ? round2((row.revenue / salesData.totalRevenue) * 100)
                          : 0;
                      return (
                        <tr
                          key={row.customerId}
                          className="hairline-b last:border-b-0 h-11"
                        >
                          <td className="px-3">{row.name}</td>
                          <td className="px-3 text-end">
                            <Num>{fmt(row.invoices, 0)}</Num>
                          </td>
                          <td className="px-3 text-end">
                            <Num>{money(row.revenue)}</Num>
                          </td>
                          <td className="px-3 text-end">
                            <Num>{fmt(share, 1)}%</Num>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* 4. Stock Valuation */}
      <Card>
        <CardHeader title={t("report.stockValuation")} />
        <div className="overflow-x-auto">
          {stockValuation.length === 0 ? (
            <EmptyState compact title={t("empty.none")} />
          ) : (
            <>
              <table className="w-full text-xs">
                <thead className="hairline-b bg-sunken/60 text-2xs text-muted h-10">
                  <tr>
                    <th className="px-3 text-start font-medium">
                      {t("label.name")}
                    </th>
                    <th className="px-3 text-start font-medium w-20">
                      {t("label.sku")}
                    </th>
                    <th className="px-3 text-end font-medium w-16">
                      {t("label.onHand")}
                    </th>
                    <th className="px-3 text-end font-medium w-16">
                      {t("label.cost")}
                    </th>
                    <th className="px-3 text-end font-medium w-24">
                      {t("label.total")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stockValuation.slice(0, 20).map((row) => (
                    <tr
                      key={row.item.id}
                      className="hairline-b last:border-b-0 h-11"
                    >
                      <td className="px-3">{localName(row.item, locale)}</td>
                      <td className="px-3 text-muted">
                        <span className="text-2xs">{row.item.sku}</span>
                      </td>
                      <td className="px-3 text-end">
                        <Num>{fmt(row.qty, 0)}</Num>
                      </td>
                      <td className="px-3 text-end">
                        <Num>{money(row.item.cost)}</Num>
                      </td>
                      <td className="px-3 text-end">
                        <Num>{money(row.value)}</Num>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="hairline-t bg-sunken/60 h-11">
                  <tr>
                    <td colSpan={4} className="px-3 font-semibold">
                      {t("label.total")}
                    </td>
                    <td className="px-3 text-end font-semibold">
                      <Num>
                        {money(
                          stockValuation
                            .slice(0, 20)
                            .reduce((s, r) => s + r.value, 0),
                        )}
                      </Num>
                    </td>
                  </tr>
                </tfoot>
              </table>
              <p className="text-2xs text-faint p-3 border-t border-line">
                {t("report.valuationNote")}
              </p>
            </>
          )}
        </div>
      </Card>

      {/* 5. Slow Movers */}
      <Card>
        <CardHeader title={t("report.slowMovers")} />
        <div className="overflow-x-auto">
          {slowMovers.length === 0 ? (
            <EmptyState compact title={t("empty.none")} />
          ) : (
            <table className="w-full text-xs">
              <thead className="hairline-b bg-sunken/60 text-2xs text-muted h-10">
                <tr>
                  <th className="px-3 text-start font-medium">
                    {t("label.name")}
                  </th>
                  <th className="px-3 text-start font-medium w-20">
                    {t("label.sku")}
                  </th>
                  <th className="px-3 text-end font-medium w-16">
                    {t("label.onHand")}
                  </th>
                  <th className="px-3 text-end font-medium w-20">
                    {t("label.total")}
                  </th>
                  <th className="px-3 text-end font-medium w-32">
                    {t("report.noMovementDays")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {slowMovers.map((row) => (
                  <tr
                    key={row.item.id}
                    className="hairline-b last:border-b-0 h-11"
                  >
                    <td className="px-3">{localName(row.item, locale)}</td>
                    <td className="px-3 text-muted">
                      <span className="text-2xs">{row.item.sku}</span>
                    </td>
                    <td className="px-3 text-end">
                      <Num>{fmt(row.qty, 0)}</Num>
                    </td>
                    <td className="px-3 text-end">
                      <Num>{money(row.value)}</Num>
                    </td>
                    <td className="px-3 text-end">
                      {/* Bare figures: the unit is in the header, which keeps
                          the column aligned and sidesteps Arabic agreement. */}
                      <Num>{fmt(row.days, 0)}</Num>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
      </div>
    </>
  );
}
