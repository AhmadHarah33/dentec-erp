"use client";

import { useMemo, useState, useTransition } from "react";
import type { CurrencyCode, Party, PartyKind } from "@/lib/data/types";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { PARTY_KINDS } from "@/lib/labels";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { saveParty } from "@/app/actions/parties";
import { PageHeader, StatTile } from "@/components/ui/page";
import { IconAlert, IconCoins, IconUsers } from "@/components/ui/icons";
import {
  Badge,
  Button,
  Field,
  Input,
  LinkButton,
  Num,
  NumberInput,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Drawer, DrawerSection } from "@/components/ui/drawer";
import { DetailRow } from "@/components/ui/page";
import { IconPlus } from "@/components/ui/icons";

export interface PartyRow {
  party: Party;
  balance: number;
  documents: number;
}

const BLANK = {
  code: "",
  name: "",
  kind: "clinic" as PartyKind,
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  taxNumber: "",
  creditLimit: 0,
  notes: "",
  active: true,
};

export function PartiesClient({
  which,
  title,
  subtitle,
  newLabel,
  rows,
  currency,
  locale,
}: {
  which: "customers" | "suppliers";
  title: string;
  subtitle: string;
  newLabel: string;
  rows: PartyRow[];
  currency: CurrencyCode;
  locale: string;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [viewing, setViewing] = useState<PartyRow | null>(null);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const money = (n: number) => formatMoney(n, currency, locale);
  const compact = (n: number) => formatMoneyCompact(n, currency, locale);
  const visible = useMemo(
    () => rows.filter((r) => showInactive || r.party.active),
    [rows, showInactive],
  );

  const totals = useMemo(
    () => ({
      count: visible.length,
      owed: visible.reduce((s, r) => s + Math.max(r.balance, 0), 0),
      overLimit: visible.filter(
        (r) => r.party.creditLimit > 0 && r.balance > r.party.creditLimit,
      ).length,
    }),
    [visible],
  );

  function openNew() {
    // Suggest the next code in the existing series so numbering stays tidy.
    const prefix = which === "customers" ? "C-" : "S-";
    const highest = rows
      .map((r) => Number.parseInt(r.party.code.replace(prefix, ""), 10))
      .filter((n) => Number.isFinite(n))
      .reduce((a, b) => Math.max(a, b), which === "customers" ? 1000 : 2000);

    setForm({
      ...BLANK,
      code: prefix + (highest + 1),
      kind: which === "suppliers" ? "dealer" : "clinic",
    });
    setEditing(null);
    setError(null);
    setOpen(true);
  }

  function openEdit(party: Party) {
    const { id, createdAt, updatedAt, ...rest } = party;
    void id;
    void createdAt;
    void updatedAt;
    setForm(rest);
    setEditing(party);
    setError(null);
    setOpen(true);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveParty(which, editing?.id ?? null, form);
      if (result.ok) setOpen(false);
      else setError(t(result.errorKey as MessageKey));
    });
  }

  const columns: Column<PartyRow>[] = [
    {
      key: "code",
      header: t("label.code"),
      width: "90px",
      sort: (r) => r.party.code,
      search: (r) => r.party.code,
      render: (r) => <Num className="text-muted text-2xs">{r.party.code}</Num>,
    },
    {
      key: "name",
      header: t("label.name"),
      sort: (r) => r.party.name,
      search: (r) =>
        `${r.party.name} ${r.party.contactPerson} ${r.party.phone} ${r.party.email} ${r.party.city}`,
      render: (r) => (
        <span className={r.party.active ? "" : "text-muted line-through"}>{r.party.name}</span>
      ),
    },
    {
      key: "kind",
      header: t("label.type"),
      width: "90px",
      secondary: true,
      sort: (r) => r.party.kind,
      render: (r) => <Badge tone="muted">{t(`kind.${r.party.kind}` as MessageKey)}</Badge>,
    },
    {
      key: "city",
      header: t("label.city"),
      width: "110px",
      tertiary: true,
      sort: (r) => r.party.city,
      render: (r) => <span className="text-muted text-2xs">{r.party.city || "—"}</span>,
    },
    {
      key: "phone",
      header: t("label.phone"),
      width: "140px",
      tertiary: true,
      render: (r) => <Num className="text-muted text-2xs">{r.party.phone || "—"}</Num>,
    },
    {
      key: "documents",
      header: which === "customers" ? t("nav.invoices") : t("nav.purchases"),
      align: "end",
      width: "90px",
      tertiary: true,
      sort: (r) => r.documents,
      render: (r) => <Num className="text-muted">{r.documents}</Num>,
    },
    {
      key: "balance",
      header: t("label.balance"),
      align: "end",
      width: "130px",
      sort: (r) => r.balance,
      render: (r) => {
        const over = r.party.creditLimit > 0 && r.balance > r.party.creditLimit;
        return (
          <Num
            className={
              over
                ? "text-danger font-medium"
                : r.balance > 0.005
                  ? "font-medium"
                  : "text-faint"
            }
            // Flag anyone past the credit limit we granted them.
            title={over ? t("label.creditLimit") : undefined}
          >
            {money(r.balance)}
          </Num>
        );
      },
    },
  ];

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

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatTile label={title} value={String(totals.count)} icon={IconUsers} />
        <StatTile
          label={which === "customers" ? t("dash.receivables") : t("label.balance")}
          value={compact(totals.owed)}
          icon={IconCoins}
          tone={totals.owed > 0 ? "warn" : "success"}
        />
        <StatTile
          label={t("label.creditLimit")}
          value={String(totals.overLimit)}
          icon={IconAlert}
          tone={totals.overLimit > 0 ? "danger" : "success"}
          chip={totals.overLimit > 0 ? t("dash.tileBad") : t("dash.tileGood")}
        />
      </div>

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(r) => r.party.id}
        onRowClick={(r) => setViewing(r)}
        emptyTitle={which === "customers" ? t("empty.customers") : t("empty.suppliers")}
        emptyAction={
          <Button variant="primary" onClick={openNew}>
            {newLabel}
          </Button>
        }
        filters={
          <label className="flex items-center gap-1.5 text-2xs text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            {t("label.inactive")}
          </label>
        }
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? editing.name : newLabel}
        width="lg"
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
          <Field label={t("label.name")} required className="sm:col-span-2">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </Field>
          <Field label={t("label.code")}>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              dir="ltr"
              className="text-start"
            />
          </Field>
          <Field label={t("label.type")}>
            <Select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as PartyKind })}
            >
              {PARTY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kind.${k}` as MessageKey)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("label.contactPerson")}>
            <Input
              value={form.contactPerson}
              onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
            />
          </Field>
          <Field label={t("label.phone")}>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              dir="ltr"
              className="text-start"
            />
          </Field>
          <Field label={t("label.email")}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              dir="ltr"
              className="text-start"
            />
          </Field>
          <Field label={t("label.city")}>
            <Input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </Field>
          <Field label={t("label.address")} className="sm:col-span-2">
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Field label={t("label.taxNumber")}>
            <Input
              value={form.taxNumber}
              onChange={(e) => setForm({ ...form, taxNumber: e.target.value })}
              dir="ltr"
              className="text-start"
            />
          </Field>
          <Field label={`${t("label.creditLimit")} (${currency})`} hint={t("label.optional")}>
            <NumberInput
              value={form.creditLimit}
              min={0}
              onChange={(e) => setForm({ ...form, creditLimit: Number(e.target.value) })}
            />
          </Field>
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

      <Drawer
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing?.party.name ?? ""}
        meta={viewing?.party.code}
        badge={
          viewing && <Badge tone="muted">{t(`kind.${viewing.party.kind}` as MessageKey)}</Badge>
        }
        footer={
          viewing && (
            <>
              <LinkButton
                href={`/${which}/${viewing.party.id}`}
                variant="primary"
                className="flex-1"
              >
                {t("action.openFull")}
              </LinkButton>
              <Button
                onClick={() => {
                  const party = viewing.party;
                  setViewing(null);
                  openEdit(party);
                }}
              >
                {t("action.edit")}
              </Button>
            </>
          )
        }
      >
        {viewing && (
          <>
            <DrawerSection>
              <DetailRow label={t("label.contactPerson")}>
                {viewing.party.contactPerson || "—"}
              </DetailRow>
              <DetailRow label={t("label.phone")}>
                <Num>{viewing.party.phone || "—"}</Num>
              </DetailRow>
              <DetailRow label={t("label.email")}>{viewing.party.email || "—"}</DetailRow>
              <DetailRow label={t("label.city")}>{viewing.party.city || "—"}</DetailRow>
              <DetailRow label={t("label.address")}>{viewing.party.address || "—"}</DetailRow>
              <DetailRow label={t("label.taxNumber")}>
                <Num>{viewing.party.taxNumber || "—"}</Num>
              </DetailRow>
            </DrawerSection>

            <DrawerSection title={t("label.balance")}>
              <DetailRow label={t("label.balance")}>
                <Num className={viewing.balance > 0.005 ? "text-danger font-semibold" : undefined}>
                  {money(viewing.balance)}
                </Num>
              </DetailRow>
              <DetailRow label={t("label.creditLimit")}>
                <Num>{viewing.party.creditLimit > 0 ? money(viewing.party.creditLimit) : "—"}</Num>
              </DetailRow>
              <DetailRow label={which === "customers" ? t("nav.invoices") : t("nav.purchases")}>
                <Num>{viewing.documents}</Num>
              </DetailRow>
            </DrawerSection>

            {viewing.party.notes && (
              <DrawerSection title={t("label.notes")}>
                <p className="text-2xs text-muted leading-relaxed py-2">{viewing.party.notes}</p>
              </DrawerSection>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
