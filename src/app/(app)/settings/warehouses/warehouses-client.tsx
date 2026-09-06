"use client";

import { useState, useTransition } from "react";
import type { CurrencyCode, Warehouse } from "@/lib/data/types";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { localName } from "@/lib/labels";
import { formatMoney, formatNumber } from "@/lib/money";
import { deleteWarehouse, saveWarehouse } from "@/app/actions/stock";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Badge, Button, Card, Field, Input, Num } from "@/components/ui/primitives";
import { Modal, Confirm } from "@/components/ui/modal";
import { PageTabs } from "@/components/ui/tabs";
import { SETTINGS_TABS } from "@/lib/tabs";
import { IconEdit, IconPlus, IconTrash } from "@/components/ui/icons";

export interface WarehouseRow {
  warehouse: Warehouse;
  lines: number;
  units: number;
  value: number;
}

const BLANK = {
  nameAr: "",
  nameTr: "",
  location: "",
  isDefault: false,
  active: true,
};

export function WarehousesClient({
  rows,
  currency,
  locale,
}: {
  rows: WarehouseRow[];
  currency: CurrencyCode;
  locale: string;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [form, setForm] = useState(BLANK);
  const [confirming, setConfirming] = useState<Warehouse | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openNew() {
    setForm({ ...BLANK, isDefault: rows.length === 0 });
    setEditing(null);
    setError(null);
    setOpen(true);
  }

  function openEdit(w: Warehouse) {
    setForm({
      nameAr: w.nameAr,
      nameTr: w.nameTr,
      location: w.location,
      isDefault: w.isDefault,
      active: w.active,
    });
    setEditing(w);
    setError(null);
    setOpen(true);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveWarehouse(editing?.id ?? null, form);
      if (result.ok) setOpen(false);
      else setError(t(result.errorKey as MessageKey));
    });
  }

  function confirmDelete() {
    if (!confirming) return;
    startTransition(async () => {
      const result = await deleteWarehouse(confirming.id);
      if (result.ok) setConfirming(null);
      else setError(t(result.errorKey as MessageKey) + " — " + (result.detail ?? ""));
    });
  }

  return (
    <>
      <PageHeader
        title={t("page.warehouses.title")}
        subtitle={t("page.warehouses.subtitle")}
        actions={
          <Button variant="primary" onClick={openNew}>
            <IconPlus />
            {t("page.warehouses.new")}
          </Button>
        }
      />

      <PageTabs tabs={SETTINGS_TABS.map((x) => ({ href: x.href, label: t(x.labelKey) }))} />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title={t("empty.none")}
            action={
              <Button variant="primary" onClick={openNew}>
                {t("page.warehouses.new")}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(({ warehouse, lines, units, value }) => (
            <Card key={warehouse.id} className="p-3 group">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs font-semibold truncate">
                      {localName(warehouse, locale)}
                    </h2>
                    {warehouse.isDefault && (
                      <Badge tone="accent">{t("page.warehouses.default")}</Badge>
                    )}
                    {!warehouse.active && <Badge tone="muted">{t("label.inactive")}</Badge>}
                  </div>
                  <p className="text-2xs text-faint mt-0.5 truncate">
                    {warehouse.location || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEdit(warehouse)}
                    aria-label={t("action.edit")}
                  >
                    <IconEdit />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="hover:text-danger"
                    onClick={() => {
                      setError(null);
                      setConfirming(warehouse);
                    }}
                    aria-label={t("action.delete")}
                  >
                    <IconTrash />
                  </Button>
                </div>
              </div>

              <dl className="grid grid-cols-3 gap-2 pt-3 hairline-t">
                <div>
                  <dt className="text-2xs text-faint">{t("page.warehouses.itemsHeld")}</dt>
                  <dd className="text-xs font-medium mt-0.5">
                    <Num>{formatNumber(lines, locale, 0)}</Num>
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs text-faint">{t("label.quantity")}</dt>
                  <dd className="text-xs font-medium mt-0.5">
                    <Num>{formatNumber(units, locale, 0)}</Num>
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs text-faint">{t("label.value")}</dt>
                  <dd className="text-xs font-medium mt-0.5">
                    <Num>{formatMoney(value, currency, locale)}</Num>
                  </dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t("action.edit") : t("page.warehouses.new")}
        footer={
          <>
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
          <Field label={t("label.nameAr")} required>
            <Input
              value={form.nameAr}
              onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
              autoFocus
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
          <Field label={t("label.location")} className="sm:col-span-2">
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              className="accent-[var(--color-accent)]"
            />
            {t("page.warehouses.default")}
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
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
    </>
  );
}
