"use client";

import { useMemo, useState, useTransition } from "react";
import type { Category, CurrencyCode, Item, Warehouse } from "@/lib/data/types";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { categoryPath, localName } from "@/lib/labels";
import { formatMoney, formatMoneyCompact, formatNumber } from "@/lib/money";
import { stockHealth } from "@/lib/stock";
import { today } from "@/lib/dates";
import { adjustStock, transferStock } from "@/app/actions/stock";
import { PageHeader, StatTile } from "@/components/ui/page";
import { IconCoins, IconLayers, IconWarehouse } from "@/components/ui/icons";
import {
  Button,
  Dot,
  Field,
  Input,
  Num,
  NumberInput,
  Select,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { PageTabs } from "@/components/ui/tabs";
import { STOCK_TABS } from "@/lib/tabs";
import { Modal } from "@/components/ui/modal";

export interface InventoryRow {
  item: Item;
  total: number;
  perWarehouse: Record<string, number>;
  value: number;
}

export function InventoryClient({
  rows,
  warehouses,
  categories,
  currency,
  locale,
}: {
  rows: InventoryRow[];
  warehouses: Warehouse[];
  categories: Category[];
  currency: CurrencyCode;
  locale: string;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [onlyLow, setOnlyLow] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);
  const [transferring, setTransferring] = useState<InventoryRow | null>(null);

  const defaultWarehouse = warehouses.find((w) => w.isDefault) ?? warehouses[0];

  const [adjustForm, setAdjustForm] = useState({
    warehouseId: defaultWarehouse?.id ?? "",
    qtyDelta: 0,
    date: today(),
    note: "",
  });
  const [transferForm, setTransferForm] = useState({
    fromWarehouseId: defaultWarehouse?.id ?? "",
    toWarehouseId: warehouses[1]?.id ?? "",
    qty: 1,
    date: today(),
    note: "",
  });

  const money = (n: number) => formatMoney(n, currency, locale);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (typeFilter && r.item.itemType !== typeFilter) return false;
        if (onlyLow && stockHealth(r.total, r.item.minStock) === "ok") return false;
        if (warehouseFilter && (r.perWarehouse[warehouseFilter] ?? 0) === 0) return false;
        return true;
      }),
    [rows, onlyLow, typeFilter, warehouseFilter],
  );

  const totals = useMemo(
    () => ({
      value: filtered.reduce((s, r) => s + r.value, 0),
      units: filtered.reduce((s, r) => s + r.total, 0),
      low: filtered.filter((r) => stockHealth(r.total, r.item.minStock) !== "ok").length,
    }),
    [filtered],
  );

  function openAdjust(row: InventoryRow) {
    setAdjustForm({
      warehouseId: defaultWarehouse?.id ?? "",
      qtyDelta: 0,
      date: today(),
      note: "",
    });
    setError(null);
    setAdjusting(row);
  }

  function submitAdjust() {
    if (!adjusting) return;
    setError(null);
    startTransition(async () => {
      const result = await adjustStock({ ...adjustForm, itemId: adjusting.item.id });
      if (result.ok) setAdjusting(null);
      else setError(t(result.errorKey as MessageKey));
    });
  }

  function submitTransfer() {
    if (!transferring) return;
    setError(null);
    startTransition(async () => {
      const result = await transferStock({ ...transferForm, itemId: transferring.item.id });
      if (result.ok) setTransferring(null);
      else setError(t(result.errorKey as MessageKey));
    });
  }

  const columns: Column<InventoryRow>[] = [
    {
      key: "sku",
      header: t("label.sku"),
      width: "110px",
      secondary: true,
      sort: (r) => r.item.sku,
      search: (r) => r.item.sku,
      render: (r) => <Num className="text-muted text-2xs">{r.item.sku}</Num>,
    },
    {
      key: "name",
      header: t("label.name"),
      sort: (r) => r.item.nameAr,
      search: (r) =>
        `${r.item.nameAr} ${r.item.nameTr} ${r.item.brand} ${r.item.model} ` +
        categoryPath(categories.find((c) => c.id === r.item.categoryId), categories, locale),
      render: (r) => (
        <span>
          {localName(r.item, locale)}
          <span className="text-2xs text-faint ms-2">
            {t(`scope.${r.item.itemType}` as MessageKey)}
          </span>
        </span>
      ),
    },
    ...warehouses.map<Column<InventoryRow>>((w) => ({
      key: "w-" + w.id,
      header: localName(w, locale),
      align: "end",
      width: "96px",
      tertiary: true,
      sort: (r) => r.perWarehouse[w.id] ?? 0,
      render: (r) => {
        const qty = r.perWarehouse[w.id] ?? 0;
        return (
          <Num className={qty === 0 ? "text-faint" : "text-muted"}>
            {formatNumber(qty, locale)}
          </Num>
        );
      },
    })),
    {
      key: "total",
      header: t("label.onHand"),
      align: "end",
      width: "110px",
      sort: (r) => r.total,
      render: (r) => {
        const health = stockHealth(r.total, r.item.minStock);
        return (
          <Dot tone={health === "out" ? "danger" : health === "low" ? "warn" : "success"}>
            <Num className={health === "ok" ? "font-medium" : "font-medium"}>
              {formatNumber(r.total, locale)}
            </Num>
          </Dot>
        );
      },
    },
    {
      key: "min",
      header: t("label.minStock"),
      align: "end",
      width: "80px",
      tertiary: true,
      sort: (r) => r.item.minStock,
      render: (r) => (
        <Num className="text-faint text-2xs">{formatNumber(r.item.minStock, locale)}</Num>
      ),
    },
    {
      key: "value",
      header: t("label.value"),
      align: "end",
      width: "120px",
      secondary: true,
      sort: (r) => r.value,
      render: (r) => <Num className="text-muted">{money(r.value)}</Num>,
    },
    {
      key: "actions",
      header: "",
      align: "end",
      width: "150px",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => openAdjust(r)}>
            {t("action.adjust")}
          </Button>
          {warehouses.length > 1 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setError(null);
                setTransferForm((f) => ({ ...f, qty: 1, date: today() }));
                setTransferring(r);
              }}
            >
              {t("action.transfer")}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title={t("page.inventory.title")} subtitle={t("page.inventory.subtitle")} />
      <PageTabs tabs={STOCK_TABS.map((x) => ({ href: x.href, label: t(x.labelKey) }))} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile
          label={t("dash.stockValue")}
          value={formatMoneyCompact(totals.value, currency, locale)}
          icon={IconCoins}
          meta={t("dash.atStandardCost")}
        />
        <StatTile
          label={t("label.quantity")}
          value={formatNumber(totals.units, locale, 0)}
          icon={IconLayers}
        />
        <StatTile
          label={t("dash.lowStockCount")}
          value={formatNumber(totals.low, locale, 0)}
          icon={IconLayers}
          tone={totals.low > 0 ? "danger" : "success"}
          chip={totals.low > 0 ? t("dash.tileCritical") : t("dash.tileGood")}
        />
        <StatTile
          label={t("nav.warehouses")}
          value={formatNumber(warehouses.length, locale, 0)}
          icon={IconWarehouse}
        />
      </div>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.item.id}
        pageSize={30}
        emptyTitle={t("empty.items")}
        filters={
          <>
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-36"
              aria-label={t("label.type")}
            >
              <option value="">{t("label.all")}</option>
              <option value="product">{t("scope.product")}</option>
              <option value="spare_part">{t("scope.spare_part")}</option>
            </Select>
            <Select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
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
            <label className="flex items-center gap-1.5 text-2xs text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={onlyLow}
                onChange={(e) => setOnlyLow(e.target.checked)}
                className="accent-[var(--color-accent)]"
              />
              {t("page.inventory.onlyLow")}
            </label>
          </>
        }
      />

      {/* Adjustment ------------------------------------------------ */}
      <Modal
        open={adjusting !== null}
        onClose={() => setAdjusting(null)}
        title={t("action.adjust")}
        description={adjusting ? localName(adjusting.item, locale) : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdjusting(null)} disabled={pending}>
              {t("action.cancel")}
            </Button>
            <Button variant="primary" onClick={submitAdjust} disabled={pending}>
              {t("action.save")}
            </Button>
          </>
        }
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t("label.warehouse")}>
            <Select
              value={adjustForm.warehouseId}
              onChange={(e) => setAdjustForm({ ...adjustForm, warehouseId: e.target.value })}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {localName(w, locale)}
                  {adjusting ? ` — ${formatNumber(adjusting.perWarehouse[w.id] ?? 0, locale)}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("label.date")}>
            <Input
              type="date"
              value={adjustForm.date}
              onChange={(e) => setAdjustForm({ ...adjustForm, date: e.target.value })}
              dir="ltr"
            />
          </Field>
          <Field
            label={t("label.quantity")}
            hint="+ / −"
            className="sm:col-span-2"
          >
            <NumberInput
              value={adjustForm.qtyDelta}
              step="1"
              onChange={(e) => setAdjustForm({ ...adjustForm, qtyDelta: Number(e.target.value) })}
            />
          </Field>
          <Field label={t("label.notes")} className="sm:col-span-2">
            <Input
              value={adjustForm.note}
              onChange={(e) => setAdjustForm({ ...adjustForm, note: e.target.value })}
            />
          </Field>
        </div>
        {error && <p className="text-2xs text-danger mt-3">{error}</p>}
      </Modal>

      {/* Transfer -------------------------------------------------- */}
      <Modal
        open={transferring !== null}
        onClose={() => setTransferring(null)}
        title={t("action.transfer")}
        description={transferring ? localName(transferring.item, locale) : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTransferring(null)} disabled={pending}>
              {t("action.cancel")}
            </Button>
            <Button variant="primary" onClick={submitTransfer} disabled={pending}>
              {t("action.transfer")}
            </Button>
          </>
        }
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t("action.transfer")}>
            <Select
              value={transferForm.fromWarehouseId}
              onChange={(e) =>
                setTransferForm({ ...transferForm, fromWarehouseId: e.target.value })
              }
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {localName(w, locale)}
                  {transferring
                    ? ` — ${formatNumber(transferring.perWarehouse[w.id] ?? 0, locale)}`
                    : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("label.warehouse")}>
            <Select
              value={transferForm.toWarehouseId}
              onChange={(e) => setTransferForm({ ...transferForm, toWarehouseId: e.target.value })}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {localName(w, locale)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("label.quantity")}>
            <NumberInput
              value={transferForm.qty}
              min={1}
              onChange={(e) => setTransferForm({ ...transferForm, qty: Number(e.target.value) })}
            />
          </Field>
          <Field label={t("label.date")}>
            <Input
              type="date"
              value={transferForm.date}
              onChange={(e) => setTransferForm({ ...transferForm, date: e.target.value })}
              dir="ltr"
            />
          </Field>
          <Field label={t("label.notes")} className="sm:col-span-2">
            <Input
              value={transferForm.note}
              onChange={(e) => setTransferForm({ ...transferForm, note: e.target.value })}
            />
          </Field>
        </div>
        {error && <p className="text-2xs text-danger mt-3">{error}</p>}
      </Modal>
    </>
  );
}
