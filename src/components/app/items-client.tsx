"use client";

import { useMemo, useState, useTransition } from "react";
import type {
  Category,
  CategoryScope,
  CurrencyCode,
  Item,
  ItemType,
  Unit,
} from "@/lib/data/types";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { categoryPath, localName, UNITS } from "@/lib/labels";
import { formatMoney, formatNumber } from "@/lib/money";
import { stockHealth } from "@/lib/stock";
import { deleteItem, saveCategory, saveItem } from "@/app/actions/catalog";
import { PageHeader, EmptyState, Toolbar } from "@/components/ui/page";
import {
  Badge,
  Button,
  CardHeader,
  Dot,
  Field,
  Input,
  Num,
  NumberInput,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { Modal, Confirm } from "@/components/ui/modal";
import { Drawer, DrawerSection } from "@/components/ui/drawer";
import { DetailRow } from "@/components/ui/page";
import { IconPlus, IconSearch, IconTag } from "@/components/ui/icons";

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

const SCOPES: CategoryScope[] = ["product", "spare_part", "both"];

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

function blankCategory(itemType: ItemType) {
  return { nameAr: "", nameTr: "", appliesTo: itemType as CategoryScope };
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
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryForm, setCategoryForm] = useState(() => blankCategory(itemType));
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const money = (n: number) => formatMoney(n, currency, locale);
  const [viewing, setViewing] = useState<Item | null>(null);

  const usable = useMemo(
    () =>
      categories.filter((c) => c.appliesTo === "both" || c.appliesTo === itemType),
    [categories, itemType],
  );

  // Alphabetical by path, so "Parent › Child" categories sort with their kin.
  const orderedCategories = useMemo(
    () =>
      usable
        .slice()
        .sort((a, b) =>
          categoryPath(a, categories, locale).localeCompare(
            categoryPath(b, categories, locale),
            locale,
          ),
        ),
    [usable, categories, locale],
  );

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (!showInactive && !i.active) return false;
      if (!q) return true;
      const haystack = `${i.sku} ${i.nameAr} ${i.nameTr} ${i.brand} ${i.model} ${i.barcode}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [items, showInactive, query]);

  // One card per category, plus an "uncategorized" card — spacing between
  // cards is what makes the catalog scannable instead of one long list.
  const groups = useMemo(() => {
    const byCategory = new Map<string, Item[]>();
    for (const item of visibleItems) {
      const key = item.categoryId ?? "";
      const bucket = byCategory.get(key);
      if (bucket) bucket.push(item);
      else byCategory.set(key, [item]);
    }
    const sortRows = (rows: Item[]) =>
      rows.slice().sort((a, b) => localName(a, locale).localeCompare(localName(b, locale), locale));

    const result: { id: string; label: string; rows: Item[] }[] = [];
    for (const category of orderedCategories) {
      const rows = byCategory.get(category.id);
      if (rows?.length) {
        result.push({
          id: category.id,
          label: categoryPath(category, categories, locale),
          rows: sortRows(rows),
        });
      }
    }
    const uncategorized = byCategory.get("");
    if (uncategorized?.length) {
      result.push({ id: "", label: t("label.uncategorized"), rows: sortRows(uncategorized) });
    }
    return result;
  }, [visibleItems, orderedCategories, categories, locale, t]);

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

  function moveToCategory(item: Item, categoryId: string) {
    const { id, createdAt, updatedAt, ...rest } = item;
    void createdAt;
    void updatedAt;
    setMovingId(null);
    startTransition(async () => {
      const result = await saveItem(id, { ...rest, categoryId: categoryId || null });
      if (!result.ok) setError(t(result.errorKey as MessageKey));
    });
  }

  function openNewCategory() {
    setCategoryForm(blankCategory(itemType));
    setCategoryError(null);
    setAddingCategory(true);
  }

  function submitCategory() {
    setCategoryError(null);
    startTransition(async () => {
      const result = await saveCategory(null, {
        nameAr: categoryForm.nameAr,
        nameTr: categoryForm.nameTr,
        parentId: null,
        appliesTo: categoryForm.appliesTo,
        sortOrder: categories.length,
      });
      if (result.ok) setAddingCategory(false);
      else
        setCategoryError(
          t(result.errorKey as MessageKey) + (result.detail ? ` — ${result.detail}` : ""),
        );
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

      <Toolbar>
        <div className="relative flex-1 min-w-40 max-w-72">
          <IconSearch
            size={15}
            className="absolute start-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("msg.searchPlaceholder")}
            aria-label={t("action.search")}
            className="ps-9"
          />
        </div>
        <label className="flex items-center gap-1.5 text-2xs text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          {t("label.inactive")}
        </label>
        <Button size="sm" variant="default" onClick={openNewCategory} className="ms-auto">
          <IconPlus size={14} />
          {t("page.categories.new")}
        </Button>
        <span className="text-2xs text-faint num">
          {t("msg.rowsCount", { n: visibleItems.length })}
        </span>
      </Toolbar>

      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <div
            key={group.id || "none"}
            className="border border-line bg-surface rounded-lg shadow-card overflow-hidden min-w-0"
          >
            <CardHeader
              title={group.label}
              meta={t("msg.rowsCount", { n: group.rows.length })}
            />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="hairline-b bg-sunken/60">
                    <th className="h-10 px-4 text-start text-2xs font-medium text-muted hidden md:table-cell w-[100px]">
                      {t("label.sku")}
                    </th>
                    <th className="h-10 px-4 text-start text-2xs font-medium text-muted">
                      {t("label.name")}
                    </th>
                    {itemType === "spare_part" && (
                      <th className="h-10 px-4 text-start text-2xs font-medium text-muted hidden xl:table-cell">
                        {t("label.fitsMachines")}
                      </th>
                    )}
                    <th className="h-10 px-4 text-end text-2xs font-medium text-muted w-[90px]">
                      {t("label.onHand")}
                    </th>
                    <th className="h-10 px-4 text-end text-2xs font-medium text-muted hidden xl:table-cell w-[90px]">
                      {t("label.cost")}
                    </th>
                    <th className="h-10 px-4 text-end text-2xs font-medium text-muted w-[100px]">
                      {t("label.price")}
                    </th>
                    <th className="h-10 px-4 text-end text-2xs font-medium text-muted hidden xl:table-cell w-[70px]">
                      {t("label.margin")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((item) => {
                    const qty = onHand[item.id] ?? 0;
                    const health = stockHealth(qty, item.minStock);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setViewing(item)}
                        className="hairline-b last:border-b-0 cursor-pointer hover:bg-sunken transition-colors"
                      >
                        <td className="py-2.5 px-4 align-middle hidden md:table-cell">
                          <Num className="text-muted text-2xs">{item.sku}</Num>
                        </td>
                        <td className="py-2.5 px-4 align-middle max-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEdit(item);
                              }}
                              className="text-start hover:text-accent transition-colors truncate min-w-0"
                            >
                              <span className={item.active ? "" : "text-muted line-through"}>
                                {localName(item, locale)}
                              </span>
                            </button>
                            {(item.brand || item.model) && (
                              <span className="text-2xs text-faint truncate shrink-0 hidden sm:inline">
                                {[item.brand, item.model].filter(Boolean).join(" · ")}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMovingId(movingId === item.id ? null : item.id);
                              }}
                              className="ms-auto shrink-0 text-faint hover:text-accent hover:bg-accent-soft rounded-sm p-1 transition-colors"
                              aria-label={t("label.moveCategory")}
                              title={t("label.moveCategory")}
                            >
                              <IconTag size={14} />
                            </button>
                          </div>
                          {movingId === item.id && (
                            <div className="mt-1.5 max-w-56" onClick={(e) => e.stopPropagation()}>
                              <Select
                                autoFocus
                                value={item.categoryId ?? ""}
                                onChange={(e) => moveToCategory(item, e.target.value)}
                                onBlur={() => setMovingId(null)}
                                className="h-8 text-2xs"
                                aria-label={t("label.moveCategory")}
                              >
                                <option value="">{t("label.uncategorized")}</option>
                                {orderedCategories.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {categoryPath(c, categories, locale)}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          )}
                        </td>
                        {itemType === "spare_part" && (
                          <td className="py-2.5 px-4 align-middle hidden xl:table-cell">
                            {item.fitsItemIds.length === 0 ? (
                              <span className="text-faint text-2xs">—</span>
                            ) : (
                              <span className="text-2xs text-muted truncate block max-w-40">
                                {item.fitsItemIds
                                  .map((id) => localName(machines.find((m) => m.id === id), locale))
                                  .join("، ")}
                              </span>
                            )}
                          </td>
                        )}
                        <td className="py-2.5 px-4 align-middle text-end">
                          <Dot tone={health === "out" ? "danger" : health === "low" ? "warn" : "muted"}>
                            <Num className={health === "ok" ? "" : "font-medium"}>
                              {formatNumber(qty, locale)}
                            </Num>
                          </Dot>
                        </td>
                        <td className="py-2.5 px-4 align-middle text-end hidden xl:table-cell">
                          <Num className="text-muted">{money(item.cost)}</Num>
                        </td>
                        <td className="py-2.5 px-4 align-middle text-end">
                          <Num className="font-medium">{money(item.price)}</Num>
                        </td>
                        <td className="py-2.5 px-4 align-middle text-end hidden xl:table-cell">
                          <Num className="text-muted text-2xs">
                            {item.price > 0
                              ? `${(((item.price - item.cost) / item.price) * 100).toFixed(0)}%`
                              : "—"}
                          </Num>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {groups.length === 0 && (
          <div className="border border-line bg-surface rounded-lg shadow-card">
            <EmptyState
              compact
              title={query ? t("empty.noResults") : t("empty.items")}
              hint={query ? t("empty.noResultsHint") : undefined}
              action={
                !query && (
                  <Button variant="primary" onClick={openNew}>
                    {newLabel}
                  </Button>
                )
              }
            />
          </div>
        )}
      </div>

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

      <Modal
        open={addingCategory}
        onClose={() => setAddingCategory(false)}
        title={t("page.categories.new")}
        width="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddingCategory(false)} disabled={pending}>
              {t("action.cancel")}
            </Button>
            <Button variant="primary" onClick={submitCategory} disabled={pending}>
              {t("action.save")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t("label.nameAr")} required>
            <Input
              value={categoryForm.nameAr}
              onChange={(e) => setCategoryForm({ ...categoryForm, nameAr: e.target.value })}
              autoFocus
            />
          </Field>
          <Field label={t("label.nameTr")} hint={t("label.optional")}>
            <Input
              value={categoryForm.nameTr}
              onChange={(e) => setCategoryForm({ ...categoryForm, nameTr: e.target.value })}
              dir="ltr"
              className="text-start"
            />
          </Field>
          <Field label={t("page.categories.scope")}>
            <Select
              value={categoryForm.appliesTo}
              onChange={(e) =>
                setCategoryForm({ ...categoryForm, appliesTo: e.target.value as CategoryScope })
              }
            >
              {SCOPES.map((s) => (
                <option key={s} value={s}>
                  {t(`scope.${s}` as MessageKey)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {categoryError && <p className="text-2xs text-danger mt-3">{categoryError}</p>}
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
