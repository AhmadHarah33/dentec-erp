"use client";

import { useState, useTransition } from "react";
import type { Settings, CurrencyCode } from "@/lib/data/types";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { updateSettings, resetDemoData } from "@/app/actions/admin";
import { PageHeader } from "@/components/ui/page";
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Num,
  NumberInput,
  Select,
} from "@/components/ui/primitives";
import { Confirm } from "@/components/ui/modal";
import { PageTabs } from "@/components/ui/tabs";
import { SETTINGS_TABS } from "@/lib/tabs";
import { IconPlus, IconTrash } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";

const CURRENCY_CODES: CurrencyCode[] = ["USD", "TRY", "SAR", "AED", "EUR", "SYP"];

export function SettingsClient({
  settings,
  dataDir,
}: {
  settings: Settings;
  dataDir: string;
}) {
  const t = useT();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(settings);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  function saveForm() {
    setError(null);
    startTransition(async () => {
      const result = await updateSettings(form);
      if (result.ok) {
        toast(t("msg.saved"));
      } else {
        setError(t(result.errorKey as MessageKey));
      }
    });
  }

  function confirmReset() {
    setResetting(false);
    setError(null);
    startTransition(async () => {
      const result = await resetDemoData();
      if (!result.ok) {
        setError(t(result.errorKey as MessageKey));
      }
    });
  }

  const baseCurrencyCode = form.baseCurrency;

  return (
    <>
      <PageHeader
        title={t("page.settings.title")}
        subtitle={t("page.settings.subtitle")}
        actions={
          <Button variant="primary" onClick={saveForm} disabled={pending}>
            {t("action.save")}
          </Button>
        }
      />

      <PageTabs tabs={SETTINGS_TABS.map((x) => ({ href: x.href, label: t(x.labelKey) }))} />

      <div className="space-y-6 max-w-4xl">

      {/* Company Card */}
      <Card>
        <CardHeader title={t("page.settings.company")} />
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("label.name")} required>
              <Input
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              />
            </Field>
            <Field label={t("label.nameTr")} hint={t("label.optional")}>
              <Input
                value={form.companyNameTr}
                onChange={(e) => setForm({ ...form, companyNameTr: e.target.value })}
                dir="ltr"
              />
            </Field>
          </div>
          <Field label={t("label.address")}>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("label.phone")}>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label={t("label.email")}>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
          </div>
          <Field label={t("label.taxNumber")}>
            <Input
              dir="ltr"
              value={form.taxNumber}
              onChange={(e) => setForm({ ...form, taxNumber: e.target.value })}
            />
          </Field>
        </div>
      </Card>

      {/* Financial Card */}
      <Card>
        <CardHeader title={t("page.settings.financial")} />
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label={t("label.baseCurrency")} required>
              <Select
                value={form.baseCurrency}
                onChange={(e) => setForm({ ...form, baseCurrency: e.target.value as CurrencyCode })}
              >
                {CURRENCY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("label.taxRate")}>
              <NumberInput
                value={form.defaultTaxRate}
                onChange={(e) => setForm({ ...form, defaultTaxRate: Number(e.target.value) })}
                min={0}
                max={100}
                step={0.01}
              />
            </Field>
            <Field label={t("label.minStock")}>
              <NumberInput
                value={form.lowStockDefault}
                onChange={(e) => setForm({ ...form, lowStockDefault: Number(e.target.value) })}
                min={0}
                step={1}
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* Currencies Card */}
      <Card>
        <CardHeader
          title={t("page.settings.currencies")}
          meta={t("page.settings.rateHint")}
        />
        <div className="p-4">
          <div className="space-y-2">
            {form.currencies.map((currency, idx) => {
              const isBase = currency.code === baseCurrencyCode;
              return (
                <div key={idx} className="flex items-end gap-3">
                  <div className="flex-1">
                    <Select
                      value={currency.code}
                      onChange={(e) => {
                        const updated = [...form.currencies];
                        updated[idx].code = e.target.value as CurrencyCode;
                        setForm({ ...form, currencies: updated });
                      }}
                      disabled={isBase}
                    >
                      {CURRENCY_CODES.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex-1">
                    <NumberInput
                      value={currency.rate}
                      onChange={(e) => {
                        const updated = [...form.currencies];
                        updated[idx].rate = Number(e.target.value);
                        setForm({ ...form, currencies: updated });
                      }}
                      disabled={isBase}
                      step={0.0001}
                      min={0}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setForm({
                        ...form,
                        currencies: form.currencies.filter((_, i) => i !== idx),
                      });
                    }}
                    disabled={isBase}
                    aria-label={t("action.delete")}
                  >
                    <IconTrash />
                  </Button>
                </div>
              );
            })}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setForm({
                ...form,
                currencies: [
                  ...form.currencies,
                  { code: "USD", rate: 1 },
                ],
              });
            }}
            className="mt-3"
          >
            <IconPlus />
            {t("action.add")}
          </Button>
        </div>
      </Card>

      {/* Numbering Card */}
      <Card>
        <CardHeader title={t("page.settings.numbering")} />
        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field
            label={t("page.settings.invoicePrefix")}
            hint={t("page.settings.example", { v: `${form.invoicePrefix}-2026-0001` })}
          >
            <Input
              dir="ltr"
              value={form.invoicePrefix}
              onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })}
              placeholder="INV"
            />
          </Field>
          <Field
            label={t("page.settings.purchasePrefix")}
            hint={t("page.settings.example", { v: `${form.purchasePrefix}-2026-0001` })}
          >
            <Input
              dir="ltr"
              value={form.purchasePrefix}
              onChange={(e) => setForm({ ...form, purchasePrefix: e.target.value })}
              placeholder="PO"
            />
          </Field>
          <Field
            label={t("page.settings.servicePrefix")}
            hint={t("page.settings.example", { v: `${form.servicePrefix}-2026-0001` })}
          >
            <Input
              dir="ltr"
              value={form.servicePrefix}
              onChange={(e) => setForm({ ...form, servicePrefix: e.target.value })}
              placeholder="SRV"
            />
          </Field>
        </div>
      </Card>

      {/* Data Location & Reset */}
      <div className="p-4 rounded-sm border border-line bg-surface text-2xs text-muted">
        <p className="mb-2">{t("page.settings.dataLocation")}</p>
        <div className="flex items-center gap-2 mb-4">
          <Num className="font-mono text-faint">{dataDir}</Num>
        </div>
        <Button
          variant="danger"
          onClick={() => setResetting(true)}
        >
          <IconTrash />
          {t("action.reset")}
        </Button>
      </div>

      </div>

      {/* Feedback */}
      {error && (
        <div className="mt-4 p-3 rounded-sm bg-danger-soft border border-danger text-2xs text-danger">
          {error}
        </div>
      )}

      {/* Reset Confirmation */}
      <Confirm
        open={resetting}
        onClose={() => setResetting(false)}
        onConfirm={confirmReset}
        title={t("action.reset")}
        message={t("msg.confirmDeleteHint")}
        confirmLabel={t("action.reset")}
        pending={pending}
      />
    </>
  );
}
