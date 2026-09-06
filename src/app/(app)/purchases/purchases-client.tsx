"use client";

import { useMemo, useState } from "react";
import type { CurrencyCode, PurchaseOrder, Supplier, Warehouse } from "@/lib/data/types";
import { useT } from "@/lib/i18n/context";
import { localName, PURCHASE_TONE, PURCHASE_STATUSES, purchaseKey } from "@/lib/labels";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { IconCart, IconCheck, IconCoins } from "@/components/ui/icons";
import { purchaseTotalBase } from "@/lib/queries";
import { formatDate } from "@/lib/dates";
import { PageHeader, StatTile } from "@/components/ui/page";
import { Badge, Input, Num, Select, LinkButton } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { Drawer, DrawerSection } from "@/components/ui/drawer";
import { DetailRow } from "@/components/ui/page";

export function PurchasesClient({
  orders,
  suppliers,
  warehouses,
  currency,
  locale,
}: {
  orders: PurchaseOrder[];
  suppliers: Supplier[];
  warehouses: Warehouse[];
  currency: CurrencyCode;
  locale: string;
}) {
  const t = useT();
  const [viewing, setViewing] = useState<PurchaseOrder | null>(null);
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const money = (n: number) => formatMoney(n, currency, locale);
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);
  const warehouseById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);

  const rows = useMemo(
    () =>
      orders.filter((o) => {
        if (status && o.status !== status) return false;
        if (from && o.date < from) return false;
        if (to && o.date > to) return false;
        return true;
      }),
    [orders, status, from, to],
  );

  const totalValue = useMemo(() => rows.reduce((s, o) => s + purchaseTotalBase(o), 0), [rows]);
  const orderedCount = useMemo(() => rows.filter((o) => o.status === "ordered").length, [rows]);

  const columns: Column<PurchaseOrder>[] = [
    {
      key: "number",
      header: t("label.number"),
      width: "100px",
      secondary: true,
      sort: (r) => r.number,
      search: (r) => r.number,
      render: (r) => <Num className="font-medium">{r.number}</Num>,
    },
    {
      key: "date",
      header: t("label.date"),
      width: "110px",
      secondary: true,
      sort: (r) => r.date,
      search: (r) => r.date,
      render: (r) => <Num className="text-muted text-2xs">{formatDate(r.date, locale)}</Num>,
    },
    {
      key: "supplier",
      header: t("label.supplier"),
      sort: (r) => supplierById.get(r.supplierId)?.name ?? "",
      search: (r) => supplierById.get(r.supplierId)?.name ?? "",
      render: (r) => supplierById.get(r.supplierId)?.name ?? "—",
    },
    {
      key: "warehouse",
      header: t("label.warehouse"),
      width: "140px",
      tertiary: true,
      sort: (r) => warehouseById.get(r.warehouseId)?.nameAr ?? "",
      render: (r) => (
        <span className="text-muted text-2xs">
          {localName(warehouseById.get(r.warehouseId), locale)}
        </span>
      ),
    },
    {
      key: "status",
      header: t("label.status"),
      width: "110px",
      sort: (r) => r.status,
      render: (r) => <Badge tone={PURCHASE_TONE[r.status]}>{t(purchaseKey(r.status))}</Badge>,
    },
    {
      key: "lines",
      header: t("label.quantity"),
      width: "80px",
      align: "end",
      tertiary: true,
      sort: (r) => r.lines.length,
      render: (r) => <Num className="text-2xs text-muted">{r.lines.length}</Num>,
    },
    {
      key: "total",
      header: t("label.total"),
      width: "120px",
      align: "end",
      sort: (r) => purchaseTotalBase(r),
      render: (r) => <Num className="font-medium">{money(purchaseTotalBase(r))}</Num>,
    },
  ];

  return (
    <>
      <PageHeader
        title={t("page.purchases.title")}
        subtitle={t("page.purchases.subtitle")}
        actions={
          <LinkButton href="/purchases/new" variant="primary">
            {t("page.purchases.new")}
          </LinkButton>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatTile label={t("nav.purchases")} value={String(rows.length)} icon={IconCart} />
        <StatTile
          label={t("label.total")}
          value={formatMoneyCompact(totalValue, currency, locale)}
          icon={IconCoins}
        />
        <StatTile
          label={t("status.ordered")}
          value={String(orderedCount)}
          icon={IconCheck}
          tone={orderedCount > 0 ? "accent" : "success"}
          chip={orderedCount === 0 ? t("dash.tileGood") : undefined}
        />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={(r) => setViewing(r)}
        pageSize={40}
        emptyTitle={t("empty.purchases")}
        filters={
          <>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-36"
              aria-label={t("label.status")}
            >
              <option value="">{t("label.all")}</option>
              {PURCHASE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(purchaseKey(s))}
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
      />

      <Drawer
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing?.number ?? ""}
        meta={viewing ? supplierById.get(viewing.supplierId)?.name : undefined}
        badge={
          viewing && (
            <Badge tone={PURCHASE_TONE[viewing.status]}>{t(purchaseKey(viewing.status))}</Badge>
          )
        }
        footer={
          viewing && (
            <LinkButton href={"/purchases/" + viewing.id} variant="primary" className="w-full">
              {t("action.openFull")}
            </LinkButton>
          )
        }
      >
        {viewing && (
          <>
            <DrawerSection>
              <DetailRow label={t("label.supplier")}>
                {supplierById.get(viewing.supplierId)?.name ?? "—"}
              </DetailRow>
              <DetailRow label={t("label.warehouse")}>
                {localName(warehouseById.get(viewing.warehouseId), locale)}
              </DetailRow>
              <DetailRow label={t("label.date")}>
                <Num>{formatDate(viewing.date, locale)}</Num>
              </DetailRow>
              <DetailRow label={t("label.expectedDate")}>
                <Num>{formatDate(viewing.expectedDate, locale)}</Num>
              </DetailRow>
              <DetailRow label={t("label.total")}>
                <Num className="font-semibold">{money(purchaseTotalBase(viewing))}</Num>
              </DetailRow>
            </DrawerSection>

            <DrawerSection title={t("label.lines")}>
              {viewing.lines.map((line) => (
                <DetailRow key={line.id} label={line.description || "—"}>
                  <Num>
                    {line.qty} × {money(line.unitPrice)}
                  </Num>
                </DetailRow>
              ))}
            </DrawerSection>
          </>
        )}
      </Drawer>
    </>
  );
}
