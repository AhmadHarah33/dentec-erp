"use client";

import { useMemo, useState, useTransition } from "react";
import type { Customer, Item, ServiceJob, User } from "@/lib/data/types";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { localName } from "@/lib/labels";
import { formatNumber } from "@/lib/money";
import { today, isInMonth, startOfMonth } from "@/lib/dates";
import { saveJob } from "@/app/actions/service";
import { PageHeader, StatTile, Toolbar } from "@/components/ui/page";
import { IconCheck, IconLayers, IconPlus, IconSearch, IconWrench } from "@/components/ui/icons";
import {
  Button,
  Field,
  Input,
  NumberInput,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { ServiceBoard } from "@/components/app/service-board";

/**
 * The workshop, shaped like the workshop.
 *
 * A table sorted by date cannot answer the question this screen exists to
 * answer — what is stuck — because a job waiting three weeks on a part looks
 * exactly like one opened this morning. Columns by stage make that visible
 * without reading a single row.
 */
export function ServiceClient({
  jobs,
  customers,
  items,
  users,
  shortages,
  locale,
}: {
  jobs: ServiceJob[];
  customers: Customer[];
  items: Item[];
  users: User[];
  /** Job id → how many distinct parts it is short. Computed on the server. */
  shortages: Record<string, number>;
  locale: string;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [technicianFilter, setTechnicianFilter] = useState("");
  const [showDelivered, setShowDelivered] = useState(false);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newJobForm, setNewJobForm] = useState({
    customerId: "",
    machineItemId: "",
    machineLabel: "",
    serialNo: "",
    reportedFault: "",
    technicianId: "",
    date: today(),
    laborCharge: 0,
    underWarranty: false,
  });

  const stats = useMemo(() => {
    const open = jobs.filter((j) => j.status !== "delivered");
    return {
      open: open.length,
      awaiting: jobs.filter((j) => j.status === "awaiting_parts").length,
      short: open.filter((j) => (shortages[j.id] ?? 0) > 0).length,
      deliveredMonth: jobs.filter(
        (j) => j.status === "delivered" && isInMonth(j.date, startOfMonth()),
      ).length,
    };
  }, [jobs, shortages]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (technicianFilter && j.technicianId !== technicianFilter) return false;
      if (!q) return true;
      const customer = customers.find((c) => c.id === j.customerId)?.name ?? "";
      return (
        j.number.toLowerCase().includes(q) ||
        j.machineLabel.toLowerCase().includes(q) ||
        j.serialNo.toLowerCase().includes(q) ||
        customer.toLowerCase().includes(q)
      );
    });
  }, [jobs, customers, query, technicianFilter]);

  function submitNewJob() {
    setError(null);
    startTransition(async () => {
      const result = await saveJob(null, {
        customerId: newJobForm.customerId,
        machineItemId: newJobForm.machineItemId || null,
        machineLabel: newJobForm.machineLabel,
        serialNo: newJobForm.serialNo,
        reportedFault: newJobForm.reportedFault,
        diagnosis: "",
        status: "received",
        technicianId: newJobForm.technicianId || null,
        laborCharge: newJobForm.laborCharge,
        underWarranty: newJobForm.underWarranty,
        parts: [],
        notes: "",
        date: newJobForm.date,
      });

      if (result.ok) {
        setNewJobOpen(false);
        setNewJobForm({
          customerId: "",
          machineItemId: "",
          machineLabel: "",
          serialNo: "",
          reportedFault: "",
          technicianId: "",
          date: today(),
          laborCharge: 0,
          underWarranty: false,
        });
      } else {
        setError(t(result.errorKey as MessageKey));
      }
    });
  }

  const productItems = items.filter((i) => i.itemType === "product");
  const count = (n: number) => formatNumber(n, locale, 0);

  return (
    <>
      <PageHeader
        title={t("page.service.title")}
        subtitle={t("service.dragHint")}
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setError(null);
              setNewJobOpen(true);
            }}
          >
            <IconPlus />
            {t("page.service.new")}
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile
          label={t("dash.openJobs")}
          value={count(stats.open)}
          icon={IconWrench}
          tone={stats.open > 0 ? "accent" : "success"}
        />
        {/* On a phone the board itself is the answer to both of these, and
            four tiles push the work below the fold. */}
        <div className="hidden sm:block">
          <StatTile
            label={t("service.awaiting_parts")}
            value={count(stats.awaiting)}
            icon={IconLayers}
            tone={stats.awaiting > 0 ? "warn" : "success"}
            chip={stats.awaiting > 0 ? t("dash.tileWatch") : t("dash.tileGood")}
          />
        </div>
        <StatTile
          label={t("service.partsShort")}
          value={count(stats.short)}
          icon={IconLayers}
          tone={stats.short > 0 ? "danger" : "success"}
          chip={stats.short > 0 ? t("dash.tileBad") : t("service.noShortage")}
        />
        <div className="hidden sm:block">
          <StatTile
            label={t("service.delivered")}
            value={count(stats.deliveredMonth)}
            icon={IconCheck}
            tone="success"
            meta={t("report.thisMonth")}
          />
        </div>
      </div>

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
        <Select
          value={technicianFilter}
          onChange={(e) => setTechnicianFilter(e.target.value)}
          className="w-40"
          aria-label={t("label.technician")}
        >
          <option value="">{t("label.all")}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Button
          variant={showDelivered ? "primary" : "default"}
          onClick={() => setShowDelivered((s) => !s)}
          aria-pressed={showDelivered}
        >
          {t("service.delivered")}
        </Button>
      </Toolbar>

      <ServiceBoard
        jobs={filtered}
        customers={customers}
        users={users}
        shortages={shortages}
        showDelivered={showDelivered}
      />

      {/* New Job Modal -------------------------------------------- */}
      <Modal
        open={newJobOpen}
        onClose={() => setNewJobOpen(false)}
        title={t("page.service.new")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewJobOpen(false)} disabled={pending}>
              {t("action.cancel")}
            </Button>
            <Button variant="primary" onClick={submitNewJob} disabled={pending}>
              {t("action.save")}
            </Button>
          </>
        }
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t("label.customer")} required className="sm:col-span-2">
            <Select
              value={newJobForm.customerId}
              onChange={(e) => setNewJobForm({ ...newJobForm, customerId: e.target.value })}
            >
              <option value="">—</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t("label.machine")} className="sm:col-span-2">
            <Select
              value={newJobForm.machineItemId}
              onChange={(e) => {
                const itemId = e.target.value;
                const item = items.find((i) => i.id === itemId);
                setNewJobForm({
                  ...newJobForm,
                  machineItemId: itemId,
                  machineLabel: item ? localName(item, locale) : "",
                });
              }}
            >
              <option value="">—</option>
              {productItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {localName(i, locale)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t("label.serialNo")}>
            <Input
              value={newJobForm.serialNo}
              onChange={(e) => setNewJobForm({ ...newJobForm, serialNo: e.target.value })}
            />
          </Field>

          <Field label={t("label.date")}>
            <Input
              type="date"
              value={newJobForm.date}
              onChange={(e) => setNewJobForm({ ...newJobForm, date: e.target.value })}
              dir="ltr"
            />
          </Field>

          <Field label={t("label.fault")} required className="sm:col-span-2">
            <Textarea
              value={newJobForm.reportedFault}
              onChange={(e) => setNewJobForm({ ...newJobForm, reportedFault: e.target.value })}
              rows={3}
            />
          </Field>

          <Field label={t("label.technician")}>
            <Select
              value={newJobForm.technicianId}
              onChange={(e) => setNewJobForm({ ...newJobForm, technicianId: e.target.value })}
            >
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t("label.laborCharge")}>
            <NumberInput
              value={newJobForm.laborCharge}
              onChange={(e) =>
                setNewJobForm({ ...newJobForm, laborCharge: Number(e.target.value) })
              }
              step="0.01"
            />
          </Field>

          <label className="flex items-center gap-1.5 sm:col-span-2 cursor-pointer">
            <input
              type="checkbox"
              checked={newJobForm.underWarranty}
              onChange={(e) =>
                setNewJobForm({ ...newJobForm, underWarranty: e.target.checked })
              }
              className="accent-[var(--color-accent)]"
            />
            <span className="text-xs">{t("label.warranty")}</span>
          </label>
        </div>
        {error && <p className="text-2xs text-danger mt-3">{error}</p>}
      </Modal>
    </>
  );
}
