"use client";

import { useMemo, useState, useTransition } from "react";
import type { Category, CurrencyCode, Item, ItemType, Unit } from "@/lib/data/types";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { categoryPath, localName, UNITS } from "@/lib/labels";
import { formatMoney, formatNumber } from "@/lib/money";
import { stockHealth } from "@/lib/stock";
import { deleteItem, saveItem } from "@/app/actions/catalog";
import { PageHeader } from "@/components/ui/page";
import {
  Badge,
  Button,
  Dot,
  Field,
  Input,
  Num,
  NumberInput,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { Modal, Confirm } from "@/components/ui/modal";
import { Drawer, DrawerSection } from "@/components/ui/drawer";
import { DetailRow } from "@/components/ui/page";
import { IconPlus } from "@/components/ui/icons";

interface Props {
  itemType: ItemType;
  title: string;
  subtitle: string;
  newLabel: string;
  items: Item[];
  categories: Category[];
  /** Machines a spare part can be linked to. Empty for the products page. */
  machines: Item[];
  onHand: Record<string, number>;
  currency: CurrencyCode;
  defaultTaxRate: number;
  locale: string;
}

function blank(itemType: ItemType, taxRate: number) {
  return {
    sku: "",
    nameAr: "",
    nameTr: "",
    itemType,
    categoryId: null as string | null,
    unit: "piece" as Unit,
    cost: 0,
    price: 0,
    taxRate,
    minStock: 0,
    brand: "",
    model: "",
    barcode: "",
    fitsItemIds: [] as string[],
    notes: "",
    active: true,
  };
}

export function ItemsClient({
  itemType,
  title,
  subtitle,
  newLabel,
  items,
  categories,
  machines,
  onHand,
  currency,
  defaultTaxRate,
  locale,
}: Props) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(() => blank(itemType, defaultTaxRate));
  const [confirming, setConfirming] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const money = (n: number) => formatMoney(n, currency, locale);
  const [viewing, setViewing] = useState<Item | null>(null);

  const usable = useMemo(
    () =>
      categories.filter((c) => c.appliesTo === "both" || c.appliesTo === itemType),
    [categories, itemType],
  );

  const rows = useMemo(
    () =>
      items.filter(
        (i) =>
          (showInactive || i.active) &&
          (!categoryFilter || i.categoryId === categoryFilter),
      ),
    [items, categoryFilter, showInactive],
  );

  function openNew() {
    setForm(blank(itemType, defaultTaxRate));
    setEditing(null);
    setError(null);
    setOpen(true);
  }

  function openEdit(item: Item) {
    const { id, createdAt, updatedAt, ...rest } = item;
    void id;
    void createdAt;
    void updatedAt;
    setForm(rest);
    setEditing(item);
    setError(null);
    setOpen(true);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveItem(editing?.id ?? null, form);
      if (result.ok) setOpen(false);
      else setError(t(result.errorKey as MessageKey) + (result.detail ? ` — ${result.detail}` : ""));
    });
  }

  function confirmDelete() {
    if (!confirming) return;
    startTransition(async () => {
      const result = await deleteItem(confirming.id);
      if (result.ok) setConfirming(null);
      else setError(t(result.errorKey as MessageKey));
    });
  }

  const columns: Column<Item>[] = [
    {
      key: "sku",
      header: t("label.sku"),
      width: "110px",
      secondary: true,
      sort: (r) => r.sku,
      search: (r) => r.sku,
      render: (r) => <Num className="text-muted text-2xs">{r.sku}</Num>,
    },
    {
      key: "name",
      header: t("label.name"),
      sort: (r) => r.nameAr,
      search: (r) => `${r.nameAr} ${r.nameTr} ${r.brand} ${r.model} ${r.barcode}`,
      render: (r) => (
        <button
          type="button"
          onClick={() => openEdit(r)}
          className="text-start hover:text-accent transition-colors"
        >
          <span className={r.active ? "" : "text-muted line-through"}>
            {localName(r, locale)}
          </span>
          {(r.brand || r.model) && (
            <span className="text-2xs text-faint ms-2">
              {[r.brand, r.model].filter(Boolean).join(" · ")}
            </span>
          )}
        </button>
      ),
    },
    {
      key: "category",
      header: t("label.category"),
      secondary: true,
      sort: (r) => categoryPath(categories.find((c) => c.id === r.categoryId), categories, locale),
      search: (r) => categoryPath(categories.find((c) => c.id === r.categoryId), categories, locale),
      render: (r) => (
        <span className="text-muted text-2xs">
          {categoryPath(categories.find((c) => c.id === r.categoryId), categories, locale)}
        </span>
      ),
    },
    {
      key: "onHand",
      header: t("label.onHand"),
      align: "end",
      width: "110px",
      sort: (r) => onHand[r.id] ?? 0,
      render: (r) => {
        const qty = onHand[r.id] ?? 0;
        const health = stockHealth(qty, r.minStock);
        return (
          <Dot tone={health === "out" ? "danger" : health === "low" ? "warn" : "muted"}>
            <Num className={health === "ok" ? "" : "font-medium"}>
              {formatNumber(qty, locale)}
            </Num>
          </Dot>
        );
      },
    },
    {
      key: "cost",
      header: t("label.cost"),
      align: "end",
      width: "110px",
      tertiary: true,
      sort: (r) => r.cost,
      render: (r) => <Num className="text-muted">{money(r.cost)}</Num>,
    },
    {
      key: "price",
      header: t("label.price"),
      align: "end",
      width: "110px",
      sort: (r) => r.price,
      render: (r) => <Num className="font-medium">{money(r.price)}</Num>,
    },
    {
      key: "margin",
      header: t("label.margin"),
      align: "end",
      width: "80px",
      tertiary: true,
      sort: (r) => (r.price > 0 ? (r.price - r.cost) / r.price : 0),
      render: (r) => (
        <Num className="text-muted text-2xs">
          {r.price > 0 ? `${(((r.price - r.cost) / r.price) * 100).toFixed(0)}%` : "—"}
        </Num>
      ),
    },
  ];

  if (itemType === "spare_part") {
    columns.splice(3, 0, {
      key: "fits",
      header: t("label.fitsMachines"),
      tertiary: true,
      search: (r) =>
        r.fitsItemIds
          .map((id) => localName(machines.find((m) => m.id === id), locale))
          .join(" "),
      render: (r) =>
        r.fitsItemIds.length === 0 ? (
          <span className="text-faint text-2xs">—</span>
        ) : (
          <span className="text-2xs text-muted truncate block max-w-40">
            {r.fitsItemIds
              .map((id) => localName(machines.find((m) => m.id === id), locale))
              .join("، ")}
          </span>
        ),
    });
  }

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <Button variant="primary" onClick={openNew}>
            <IconPlus />
            {newLabel}
          </Button>
        }
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={(r) => setViewing(r)}
        emptyTitle={t("empty.items")}
        emptyAction={
          <Button variant="primary" onClick={openNew}>
            {newLabel}
          </Button>
        }
        filters={
          <>
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-44"
              aria-label={t("label.category")}
            >
              <option value="">{t("label.all")}</option>
              {usable.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryPath(c, categories, locale)}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-1.5 text-2xs text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="accent-[var(--color-accent)]"
              />
              {t("label.inactive")}
            </label>
          </>
        }
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? localName(editing, locale) : newLabel}
        description={editing?.sku}
        width="lg"
        footer={
          <>
            {editing && (
              <Button
                variant="danger"
                className="me-auto"
                onClick={() => {
                  setError(null);
                  setConfirming(editing);
                }}
                disabled={pending}
              >
                {t("action.delete")}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t("action.cancel")}
            </Button>
            <Button variant="primary" onClick={submit} disabled={pending}>
              {t("action.save")}
            </Button>
          </>
        }
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t("label.sku")} required>
            <Input
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              dir="ltr"
              className="text-start"
            />
          </Field>
          <Field label={t("label.barcode")}>
            <Input
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              dir="ltr"
              className="text-start"
            />
          </Field>
          <Field label={t("label.nameAr")} required>
            <Input
              value={form.nameAr}
              onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
            />
          </Field>
          <Field label={t("label.nameTr")} hint={t("label.optional")}>
            <Input
              value={form.nameTr}
              onChange={(e) => setForm({ ...form, nameTr: e.target.value })}
              dir="ltr"
              className="text-start"
            />
          </Field>
          <Field label={t("label.category")}>
            <Select
              value={form.categoryId ?? ""}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value || null })}
            >
              <option value="">{t("label.none")}</option>
              {usable.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryPath(c, categories, locale)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("label.unit")}>
            <Select
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value as Unit })}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {t(`unit.${u}` as MessageKey)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("label.brand")}>
            <Input
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              dir="ltr"
              className="text-start"
            />
          </Field>
          <Field label={t("label.model")}>
            <Input
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              dir="ltr"
              className="text-start"
            />
          </Field>

          <Field label={`${t("label.cost")} (${currency})`}>
            <NumberInput
              value={form.cost}
              min={0}
              step="0.01"
              onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })}
            />
          </Field>
          <Field label={`${t("label.price")} (${currency})`}>
            <NumberInput
              value={form.price}
              min={0}
              step="0.01"
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            />
          </Field>
          <Field label={`${t("label.taxRate")} %`}>
            <NumberInput
              value={form.taxRate}
              min={0}
              max={100}
              step="0.5"
              onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })}
            />
          </Field>
          <Field
            label={t("label.minStock")}
            hint={t("dash.lowStock")}
          >
            <NumberInput
              value={form.minStock}
              min={0}
              onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })}
            />
          </Field>

          {itemType === "spare_part" && (
            <Field
              label={t("label.fitsMachines")}
              className="sm:col-span-2"
              hint={t("label.optional")}
            >
              <div className="border border-line rounded-sm max-h-36 overflow-y-auto divide-y divide-line">
                {machines.map((m) => (
                  <label
                    key={m.id}
                    className="flex items-center gap-2 px-2 h-9 text-xs cursor-pointer hover:bg-sunken"
                  >
                    <input
                      type="checkbox"
                      checked={form.fitsItemIds.includes(m.id)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          fitsItemIds: e.target.checked
                            ? [...form.fitsItemIds, m.id]
                            : form.fitsItemIds.filter((x) => x !== m.id),
                        })
                      }
                      className="accent-[var(--color-accent)]"
                    />
                    <span className="truncate">{localName(m, locale)}</span>
                    <Num className="text-2xs text-faint ms-auto">{m.sku}</Num>
                  </label>
                ))}
              </div>
            </Field>
          )}

          <Field label={t("label.notes")} className="sm:col-span-2">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>

          <label className="flex items-center gap-2 text-xs cursor-pointer sm:col-span-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="accent-[var(--color-accent)]"
            />
            {t("label.active")}
          </label>
        </div>

        {error && <p className="text-2xs text-danger mt-3">{error}</p>}
      </Modal>

      <Confirm
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={confirmDelete}
        title={t("msg.confirmDelete")}
        message={error ?? t("msg.confirmDeleteHint")}
        confirmLabel={t("action.delete")}
        pending={pending}
      />

      <Drawer
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? localName(viewing, locale) : ""}
        meta={viewing?.sku}
        badge={
          viewing && (
            <Badge tone={viewing.active ? "success" : "muted"}>
              {t(viewing.active ? "label.active" : "label.inactive")}
            </Badge>
          )
        }
        footer={
          viewing && (
            <Button
              variant="primary"
              className="w-full"
              onClick={() => {
                const item = viewing;
                setViewing(null);
                openEdit(item);
              }}
            >
              {t("action.edit")}
            </Button>
          )
        }
      >
        {viewing && (
          <>
            <DrawerSection>
              <DetailRow label={t("label.category")}>
                {categoryPath(
                  categories.find((c) => c.id === viewing.categoryId),
                  categories,
                  locale,
                )}
              </DetailRow>
              <DetailRow label={t("label.brand")}>{viewing.brand || "—"}</DetailRow>
              <DetailRow label={t("label.model")}>{viewing.model || "—"}</DetailRow>
              <DetailRow label={t("label.barcode")}>
                <Num>{viewing.barcode || "—"}</Num>
              </DetailRow>
              <DetailRow label={t("label.unit")}>
                {t(`unit.${viewing.unit}` as MessageKey)}
              </DetailRow>
            </DrawerSection>

            <DrawerSection title={t("label.onHand")}>
              <DetailRow label={t("label.onHand")}>
                <Num className="font-semibold">
                  {formatNumber(onHand[viewing.id] ?? 0, locale)}
                </Num>
              </DetailRow>
              <DetailRow label={t("label.minStock")}>
                <Num>{formatNumber(viewing.minStock, locale)}</Num>
              </DetailRow>
            </DrawerSection>

            <DrawerSection title={t("label.price")}>
              <DetailRow label={t("label.cost")}>
                <Num>{money(viewing.cost)}</Num>
              </DetailRow>
              {viewing.itemType === "product" && (
                <DetailRow label={t("label.price")}>
                  <Num className="font-semibold">{money(viewing.price)}</Num>
                </DetailRow>
              )}
              <DetailRow label={t("label.taxRate")}>
                <Num>{formatNumber(viewing.taxRate, locale, 0)}%</Num>
              </DetailRow>
            </DrawerSection>

            {/* A part is found by the machine it fits, not by its own name. */}
            {viewing.itemType === "spare_part" && viewing.fitsItemIds.length > 0 && (
              <DrawerSection title={t("label.fitsMachines")}>
                <p className="text-2xs text-muted leading-relaxed py-2">
                  {viewing.fitsItemIds
                    .map((id) => localName(machines.find((m) => m.id === id), locale))
                    .join(" · ")}
                </p>
              </DrawerSection>
            )}

            {viewing.notes && (
              <DrawerSection title={t("label.notes")}>
                <p className="text-2xs text-muted leading-relaxed py-2">{viewing.notes}</p>
              </DrawerSection>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
