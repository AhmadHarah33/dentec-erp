"use client";

import { useMemo, useState, useTransition } from "react";
import type {
  Customer,
  CurrencyCode,
  Item,
  ServiceJob,
  ServicePart,
  User,
  Warehouse,
} from "@/lib/data/types";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { SERVICE_STATUSES, SERVICE_TONE, localName, serviceKey } from "@/lib/labels";
import { formatMoney, formatNumber } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { jobIsBillable } from "@/lib/service";
import { saveJob, consumeParts, setJobStatus } from "@/app/actions/service";
import { invoiceJob, orderShortage } from "@/app/actions/service-workflow";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader, DetailRow } from "@/components/ui/page";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  NumberInput,
  Select,
  Textarea,
  Num,
} from "@/components/ui/primitives";
import { IconAlert, IconCart, IconDocument } from "@/components/ui/icons";
import { Modal, Confirm } from "@/components/ui/modal";

/** A shortage row, already resolved to a name by the server page. */
interface NamedShortage {
  itemId: string;
  name: string;
  needed: number;
  onHand: number;
  short: number;
}

export function JobClient({
  job,
  customer,
  shortages,
  invoice,
  items,
  users,
  warehouses,
  currency,
  onHand: onHandRecord,
  locale,
}: {
  job: ServiceJob;
  customer: Customer | undefined;
  shortages: NamedShortage[];
  invoice: { id: string; number: string } | null;
  items: Item[];
  users: User[];
  warehouses: Warehouse[];
  currency: CurrencyCode;
  onHand: Record<string, number>;
  locale: string;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [parts, setParts] = useState(job.parts);
  const [editDiagnosisOpen, setEditDiagnosisOpen] = useState(false);
  const [diagnosis, setDiagnosis] = useState(job.diagnosis);
  const [notes, setNotes] = useState(job.notes);
  const [confirmConsumeOpen, setConfirmConsumeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add part form state
  const [addPartForm, setAddPartForm] = useState({
    itemId: "",
    qty: 1,
    warehouseId: warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id ?? "",
  });

  const money = (n: number) => formatMoney(n, currency, locale);

  // Filter spare parts (not products) for the add part select
  const spareParts = items.filter((i) => i.itemType === "spare_part");

  // Calculate totals
  const totals = useMemo(() => {
    const partsTotal = parts.reduce((sum, p) => sum + p.qty * p.unitPrice, 0);
    const jobTotal = partsTotal + job.laborCharge;
    return { partsTotal, jobTotal };
  }, [parts, job.laborCharge]);

  // Check if we have unconsumed parts
  const hasUnconsumedParts = parts.some((p) => !p.consumed);

  function submitDiagnosis() {
    setError(null);
    startTransition(async () => {
      const result = await saveJob(job.id, {
        ...job,
        diagnosis,
        notes,
        parts,
      });

      if (result.ok) {
        setEditDiagnosisOpen(false);
      } else {
        setError(t(result.errorKey as MessageKey));
      }
    });
  }

  function submitAddPart() {
    if (!addPartForm.itemId) return;

    const item = items.find((i) => i.id === addPartForm.itemId);
    if (!item) return;

    const newPart: ServicePart = {
      id: `part-${Date.now()}`, // Temporary ID, will be replaced by the server
      itemId: addPartForm.itemId,
      qty: addPartForm.qty,
      unitPrice: item.price,
      warehouseId: addPartForm.warehouseId,
      consumed: false,
    };

    const newParts = [...parts, newPart];
    setParts(newParts);

    setError(null);
    startTransition(async () => {
      const result = await saveJob(job.id, {
        ...job,
        parts: newParts,
      });

      if (result.ok) {
        setAddPartForm({
          itemId: "",
          qty: 1,
          warehouseId: addPartForm.warehouseId,
        });
      } else {
        setError(t(result.errorKey as MessageKey));
        // Revert the optimistic update
        setParts(job.parts);
      }
    });
  }

  function submitRemovePart(partId: string) {
    const newParts = parts.filter((p) => p.id !== partId);
    setParts(newParts);

    setError(null);
    startTransition(async () => {
      const result = await saveJob(job.id, {
        ...job,
        parts: newParts,
      });

      if (!result.ok) {
        setError(t(result.errorKey as MessageKey));
        // Revert the optimistic update
        setParts(parts);
      }
    });
  }

  function submitChangeStatus(status: typeof job.status) {
    setError(null);
    startTransition(async () => {
      const result = await setJobStatus(job.id, status);

      if (!result.ok) {
        setError(t(result.errorKey as MessageKey));
      }
    });
  }

  function submitConsumeParts() {
    setError(null);
    startTransition(async () => {
      const result = await consumeParts(job.id);

      if (!result.ok) {
        setError(t(result.errorKey as MessageKey));
      }
      setConfirmConsumeOpen(false);
    });
  }

  /**
   * Bill the job. The invoice comes back as a draft — nothing is issued and no
   * stock moves — so the customer-facing numbers are yours to correct first.
   */
  function submitInvoice() {
    setError(null);
    startTransition(async () => {
      const result = await invoiceJob(job.id);
      if (result.ok) router.push(`/invoices/${result.data}`);
      else setError(t(result.errorKey as MessageKey));
    });
  }

  /** Draft the purchase orders that would un-block this job. */
  function submitOrderShortage() {
    setError(null);
    startTransition(async () => {
      const result = await orderShortage(job.id);
      if (!result.ok) {
        setError(t(result.errorKey as MessageKey));
        return;
      }
      router.push(result.data.length === 1 ? `/purchases/${result.data[0]}` : "/purchases");
    });
  }

  const technician = users.find((u) => u.id === job.technicianId);
  // Same rule the invoicing action applies, so the button cannot offer an
  // invoice the server would then refuse to raise.
  const billable = jobIsBillable({ ...job, parts }, items);

  return (
    <>
      <PageHeader
        title={job.number}
        subtitle={`${customer?.name || "—"} · ${formatDate(job.date, locale)}`}
        actions={
          <>
            <Badge tone={SERVICE_TONE[job.status]}>{t(serviceKey(job.status))}</Badge>
            {invoice ? (
              <Link
                href={`/invoices/${invoice.id}`}
                className="inline-flex items-center gap-1.5 h-10 px-3 text-2xs font-semibold text-accent hover:bg-accent-soft rounded-sm transition-colors"
              >
                <IconDocument size={15} />
                <Num>{invoice.number}</Num>
              </Link>
            ) : (
              billable && (
                <Button variant="primary" onClick={submitInvoice} disabled={pending}>
                  <IconDocument size={15} />
                  {t("service.createInvoice")}
                </Button>
              )
            )}
          </>
        }
      />

      {/* Status Stepper -------------------------------------------- */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-2">
        {SERVICE_STATUSES.map((status) => {
          const isCurrentStatus = status === job.status;
          const isCompleted = SERVICE_STATUSES.indexOf(status) <
            SERVICE_STATUSES.indexOf(job.status);

          return (
            <button
              key={status}
              onClick={() => submitChangeStatus(status)}
              className={`
                flex-shrink-0 px-3 py-1.5 rounded-sm border text-xs font-medium
                transition-colors
                ${
                  isCurrentStatus
                    ? "bg-accent-soft text-accent border-accent"
                    : isCompleted
                      ? "text-muted border-line bg-surface"
                      : "text-ink border-line bg-surface hover:bg-sunken"
                }
              `}
              disabled={pending}
            >
              {t(serviceKey(status))}
            </button>
          );
        })}
      </div>

      {/* What the job is waiting for, and the one button that clears it. */}
      {shortages.length > 0 && (
        <div className="border border-warn-line bg-warn-soft rounded-lg p-4 mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="grid place-items-center size-9 rounded-sm bg-warn-soft text-warn shrink-0 border border-warn-line">
            <IconAlert size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-warn">{t("service.shortageTitle")}</p>
            <p className="text-2xs text-warn/90 mt-0.5 leading-relaxed">
              {shortages
                .map((s) => `${s.name} (${formatNumber(s.short, locale, 0)})`)
                .join(" · ")}
            </p>
            <p className="text-2xs text-warn/70 mt-1">{t("service.shortageHint")}</p>
          </div>
          <Button variant="primary" onClick={submitOrderShortage} disabled={pending}>
            <IconCart size={15} />
            {t("service.orderShortage")}
          </Button>
        </div>
      )}

      {error && <p className="text-2xs text-danger mb-3">{error}</p>}

      {/* min-w-0 on both children is load-bearing: a grid item defaults to
          min-width:auto, so without it the parts table below refuses to shrink
          and stretches the whole page wider than the phone. */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Details Card ----------------------------------------- */}
        <Card className="lg:col-span-1 min-w-0">
          <CardHeader title={t("page.service.title")} />
          <div className="px-3 py-1 divide-y divide-line">
            <DetailRow label={t("label.customer")}>
              {customer?.name || "—"}
            </DetailRow>
            <DetailRow label={t("label.machine")}>
              {job.machineLabel || "—"}
            </DetailRow>
            <DetailRow label={t("label.serialNo")}>
              <Num>{job.serialNo || "—"}</Num>
            </DetailRow>
            <DetailRow label={t("label.technician")}>
              {technician?.name || "—"}
            </DetailRow>
            <DetailRow label={t("label.date")}>
              <Num className="text-2xs">{formatDate(job.date, locale)}</Num>
            </DetailRow>
            <DetailRow label={t("label.warranty")}>
              <Badge tone={job.underWarranty ? "accent" : "muted"}>
                {t(job.underWarranty ? "label.active" : "label.inactive")}
              </Badge>
            </DetailRow>
            <DetailRow label={t("label.laborCharge")}>
              <Num>{money(job.laborCharge)}</Num>
            </DetailRow>
          </div>

          {/* Reported Fault */}
          {job.reportedFault && (
            <div className="px-3 py-2 hairline-t">
              <p className="text-2xs font-medium text-muted mb-1">
                {t("label.fault")}
              </p>
              <p className="text-2xs leading-relaxed text-ink">
                {job.reportedFault}
              </p>
            </div>
          )}

          {/* Diagnosis */}
          <div className="px-3 py-2 hairline-t">
            <div className="flex items-center justify-between mb-1">
              <p className="text-2xs font-medium text-muted">
                {t("label.diagnosis")}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDiagnosis(job.diagnosis);
                  setNotes(job.notes);
                  setEditDiagnosisOpen(true);
                }}
              >
                {t("action.edit")}
              </Button>
            </div>
            <p className="text-2xs leading-relaxed text-ink">
              {job.diagnosis || "—"}
            </p>
          </div>
        </Card>

        {/* Parts Card -------------------------------------------- */}
        <div className="lg:col-span-2 min-w-0 flex flex-col gap-4">
          <Card>
            <CardHeader
              title={t("label.parts")}
              meta={String(parts.length)}
            />

            {parts.length === 0 ? (
              <div className="px-3 py-4 text-center text-2xs text-faint">
                {t("label.none")}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="hairline-b bg-sunken/60 text-2xs text-muted">
                      <th className="h-10 px-3 text-start font-medium">
                        {t("label.name")}
                      </th>
                      <th className="h-10 px-3 text-start font-medium">
                        {t("label.warehouse")}
                      </th>
                      <th className="h-10 px-3 text-end font-medium">
                        {t("label.qty")}
                      </th>
                      <th className="h-10 px-3 text-end font-medium">
                        {t("label.unitPrice")}
                      </th>
                      <th className="h-10 px-3 text-end font-medium">
                        {t("label.lineTotal")}
                      </th>
                      <th className="h-10 px-3 text-center font-medium">
                        {t("label.status")}
                      </th>
                      <th className="h-10 px-3 text-center font-medium">
                        <span className="sr-only">{t("action.delete")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((part) => {
                      const item = items.find((i) => i.id === part.itemId);
                      const warehouse = warehouses.find(
                        (w) => w.id === part.warehouseId,
                      );

                      return (
                        <tr key={part.id} className="hairline-b last:border-b-0">
                          <td className="h-10 px-3 text-start">
                            <div>
                              <div className="text-xs font-medium">
                                {localName(item, locale)}
                              </div>
                              <div className="text-2xs text-muted">
                                {item?.sku || "—"}
                              </div>
                            </div>
                          </td>
                          <td className="h-10 px-3 text-start text-2xs text-muted">
                            {localName(warehouse, locale)}
                          </td>
                          <td className="h-10 px-3 text-end">
                            <Num className="text-2xs">
                              {formatNumber(part.qty, locale)}
                            </Num>
                          </td>
                          <td className="h-10 px-3 text-end">
                            <Num className="text-2xs">{money(part.unitPrice)}</Num>
                          </td>
                          <td className="h-10 px-3 text-end">
                            <Num className="font-medium">
                              {money(part.qty * part.unitPrice)}
                            </Num>
                          </td>
                          <td className="h-10 px-3 text-center">
                            <Badge tone={part.consumed ? "success" : "muted"}>
                              {t(part.consumed ? "service.consumed" : "service.notConsumed")}
                            </Badge>
                          </td>
                          <td className="h-10 px-3 text-center">
                            {!part.consumed && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => submitRemovePart(part.id)}
                                disabled={pending}
                              >
                                {t("action.delete")}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add Part Row ---------------------------------------- */}
            <div className="px-3 py-2 hairline-t bg-sunken/30 grid sm:grid-cols-12 gap-2 items-end">
              <div className="sm:col-span-4">
                <Field label={t("label.name")} className="text-2xs">
                  <Select
                    value={addPartForm.itemId}
                    onChange={(e) =>
                      setAddPartForm({
                        ...addPartForm,
                        itemId: e.target.value,
                      })
                    }
                    className="text-xs"
                  >
                    <option value="">—</option>
                    {spareParts.map((i) => (
                      <option key={i.id} value={i.id}>
                        {localName(i, locale)} ({
                          formatNumber(onHandRecord[i.id] ?? 0, locale)
                        })
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field label={t("label.qty")} className="text-2xs">
                  <NumberInput
                    value={addPartForm.qty}
                    onChange={(e) =>
                      setAddPartForm({
                        ...addPartForm,
                        qty: Number(e.target.value),
                      })
                    }
                    min={1}
                    step="1"
                    className="text-xs"
                  />
                </Field>
              </div>

              <div className="sm:col-span-4">
                <Field label={t("label.warehouse")} className="text-2xs">
                  <Select
                    value={addPartForm.warehouseId}
                    onChange={(e) =>
                      setAddPartForm({
                        ...addPartForm,
                        warehouseId: e.target.value,
                      })
                    }
                    className="text-xs"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {localName(w, locale)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={submitAddPart}
                  disabled={pending || !addPartForm.itemId}
                >
                  {t("action.add")}
                </Button>
              </div>
            </div>

            {/* Totals Line ----------------------------------------- */}
            <div className="px-3 py-2 hairline-t flex items-center justify-between">
              <div className="text-xs font-medium">
                {job.underWarranty ? (
                  <span className="text-muted">
                    {t("label.total")}:{" "}
                    <Num className="line-through text-faint">
                      {money(totals.jobTotal)}
                    </Num>{" "}
                    <span className="text-accent">{money(0)}</span>
                  </span>
                ) : (
                  <span>
                    {t("label.total")}:{" "}
                    <Num className="text-accent font-medium">
                      {money(totals.jobTotal)}
                    </Num>
                  </span>
                )}
              </div>
            </div>

            {/* Confirm Parts Button -------------------------------- */}
            {hasUnconsumedParts && (
              <div className="px-3 py-2 hairline-t">
                <Button
                  variant="primary"
                  onClick={() => setConfirmConsumeOpen(true)}
                  disabled={pending}
                  className="w-full"
                >
                  {t("service.confirmParts")}
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Edit Diagnosis Modal ---------------------------------------- */}
      <Modal
        open={editDiagnosisOpen}
        onClose={() => setEditDiagnosisOpen(false)}
        title={t("label.diagnosis")}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setEditDiagnosisOpen(false)}
              disabled={pending}
            >
              {t("action.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={submitDiagnosis}
              disabled={pending}
            >
              {t("action.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("label.diagnosis")}>
            <Textarea
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              rows={4}
            />
          </Field>
          <Field label={t("label.notes")}>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </Field>
        </div>
      </Modal>

      {/* Confirm Consume Parts Dialog ------------------------------ */}
      <Confirm
        open={confirmConsumeOpen}
        onClose={() => setConfirmConsumeOpen(false)}
        onConfirm={submitConsumeParts}
        title={t("service.confirmParts")}
        message={t("service.confirmPartsHint")}
        confirmLabel={t("action.confirm")}
        tone="primary"
        pending={pending}
      />
    </>
  );
}
