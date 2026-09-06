"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CurrencyCode, Item, StockMove, Warehouse } from "@/lib/data/types";
import { useT } from "@/lib/i18n/context";
import { localName, MOVE_TONE, MOVE_TYPES, moveKey } from "@/lib/labels";
import { formatMoney, formatNumber } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page";
import { Badge, Input, Num, Select } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { PageTabs } from "@/components/ui/tabs";
import { STOCK_TABS } from "@/lib/tabs";

/** Where a move came from, as a link back to the document that caused it. */
function refHref(move: StockMove): string | null {
  if (!move.refId) return null;
  switch (move.refType) {
    case "sales_invoice":
      return `/invoices/${move.refId}`;
    case "purchase_order":
      return `/purchases/${move.refId}`;
    case "service_job":
      return `/service/${move.refId}`;
    default:
      return null;
  }
}

export function MovesClient({
  moves,
  items,
  warehouses,
  currency,
  locale,
}: {
  moves: StockMove[];
  items: Item[];
  warehouses: Warehouse[];
  currency: CurrencyCode;
  locale: string;
}) {
  const t = useT();
  const [type, setType] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const warehouseById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);

  const rows = useMemo(
    () =>
      moves.filter((m) => {
        if (type && m.type !== type) return false;
        if (warehouse && m.warehouseId !== warehouse) return false;
        if (from && m.date < from) return false;
        if (to && m.date > to) return false;
        return true;
      }),
    [moves, type, warehouse, from, to],
  );

  const netUnits = useMemo(() => rows.reduce((s, m) => s + m.qtyDelta, 0), [rows]);

  const columns: Column<StockMove>[] = [
    {
      key: "date",
      header: t("label.date"),
      width: "110px",
      sort: (r) => r.date + r.createdAt,
      search: (r) => r.date,
      render: (r) => <Num className="text-muted text-2xs">{formatDate(r.date, locale)}</Num>,
    },
    {
      key: "item",
      header: t("label.name"),
      sort: (r) => itemById.get(r.itemId)?.nameAr ?? "",
      search: (r) => {
        const item = itemById.get(r.itemId);
        return `${item?.nameAr ?? ""} ${item?.nameTr ?? ""} ${item?.sku ?? ""} ${r.note}`;
      },
      render: (r) => {
        const item = itemById.get(r.itemId);
        return (
          <span>
            {localName(item, locale)}
            <Num className="text-2xs text-faint ms-2">{item?.sku}</Num>
          </span>
        );
      },
    },
    {
      key: "warehouse",
      header: t("label.warehouse"),
      width: "140px",
      secondary: true,
      sort: (r) => warehouseById.get(r.warehouseId)?.nameAr ?? "",
      render: (r) => (
        <span className="text-muted text-2xs">
          {localName(warehouseById.get(r.warehouseId), locale)}
        </span>
      ),
    },
    {
      key: "type",
      header: t("label.type"),
      width: "110px",
      secondary: true,
      sort: (r) => r.type,
      render: (r) => <Badge tone={MOVE_TONE[r.type]}>{t(moveKey(r.type))}</Badge>,
    },
    {
      key: "qty",
      header: t("label.quantity"),
      align: "end",
      width: "90px",
      sort: (r) => r.qtyDelta,
      render: (r) => (
        <Num className={r.qtyDelta > 0 ? "text-accent font-medium" : "text-ink font-medium"}>
          {r.qtyDelta > 0 ? "+" : ""}
          {formatNumber(r.qtyDelta, locale)}
        </Num>
      ),
    },
    {
      key: "cost",
      header: t("label.cost"),
      align: "end",
      width: "110px",
      tertiary: true,
      sort: (r) => r.unitCost,
      render: (r) => (
        <Num className="text-muted text-2xs">{formatMoney(r.unitCost, currency, locale)}</Num>
      ),
    },
    {
      key: "ref",
      header: t("label.reference"),
      width: "150px",
      tertiary: true,
      search: (r) => r.note,
      render: (r) => {
        const href = refHref(r);
        const label = r.note || "—";
        return href ? (
          <Link href={href} className="text-2xs text-accent hover:underline num">
            {label}
          </Link>
        ) : (
          <span className="text-2xs text-faint">{label}</span>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader title={t("page.moves.title")} subtitle={t("page.moves.subtitle")} />
      <PageTabs tabs={STOCK_TABS.map((x) => ({ href: x.href, label: t(x.labelKey) }))} />

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        pageSize={40}
        emptyTitle={t("empty.moves")}
        filters={
          <>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-36"
              aria-label={t("label.type")}
            >
              <option value="">{t("label.all")}</option>
              {MOVE_TYPES.map((m) => (
                <option key={m} value={m}>
                  {t(moveKey(m))}
                </option>
              ))}
            </Select>
            <Select
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
              className="w-40"
              aria-label={t("label.warehouse")}
            >
              <option value="">{t("label.all")}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {localName(w, locale)}
                </option>
              ))}
            </Select>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-36"
              dir="ltr"
              aria-label={t("label.date")}
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-36"
              dir="ltr"
              aria-label={t("label.dueDate")}
            />
          </>
        }
        footer={
          <tr>
            <td colSpan={4} className="h-10 px-3 text-2xs text-muted">
              {t("label.net")}
            </td>
            <td className="h-10 px-3 text-end">
              <Num className="font-medium">
                {netUnits > 0 ? "+" : ""}
                {formatNumber(netUnits, locale)}
              </Num>
            </td>
            <td className="hidden md:table-cell" />
            <td className="hidden md:table-cell" />
          </tr>
        }
      />
    </>
  );
}
