"use client";

import { useState, useTransition } from "react";
import { useLocale } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import type {
  BillingRegion,
  Customer,
  DispatchInfo,
  InvoiceDocumentType,
  SalesInvoice,
} from "@/lib/data/types";
import { BILLING_REGIONS } from "@/lib/data/types";
import {
  DOCUMENT_TYPES,
  complianceIssues,
  formatPlate,
  needsDispatch,
  resolveDocumentType,
  resolveRegion,
} from "@/lib/billing/region";
import { setInvoiceBilling } from "@/app/actions/sales";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Num,
  Select,
} from "@/components/ui/primitives";
import { DetailRow } from "@/components/ui/page";
import { Modal } from "@/components/ui/modal";
import { IconAlert } from "@/components/ui/icons";

const BLANK_DISPATCH: DispatchInfo = {
  vehiclePlate: "",
  driverName: "",
  driverTckn: "",
  carrierName: "",
  carrierTaxId: "",
  dispatchedAt: "",
  deliveryAddress: "",
};

/**
 * The regime panel on an invoice: which document this legally is, what is
 * still missing before an integrator would accept it, and — for an
 * e-İrsaliye — who is driving it where.
 *
 * The compliance list is the point of this component. Without it the first
 * time anyone learns a VKN is malformed is when the GİB rejects the document,
 * hours after it was sent.
 */
export function InvoiceBilling({
  invoice,
  customer,
}: {
  invoice: SalesInvoice;
  customer: Customer | null;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const region = resolveRegion(invoice.billingRegion ? invoice : customer);
  const documentType = resolveDocumentType(invoice, customer ?? undefined);
  const issues = complianceIssues(invoice, customer ?? undefined);

  const [form, setForm] = useState({
    billingRegion: region,
    documentType,
    dispatch: invoice.dispatch ?? BLANK_DISPATCH,
  });

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setInvoiceBilling(invoice.id, {
        billingRegion: form.billingRegion,
        documentType: form.documentType,
        dispatch: needsDispatch(form.documentType) ? form.dispatch : undefined,
      });
      if (result.ok) setOpen(false);
      else setError(t(result.errorKey as MessageKey));
    });
  }

  const dispatch = invoice.dispatch;

  return (
    <Card className="no-print">
      <CardHeader
        title={t("billing.region")}
        action={
          <Button onClick={() => setOpen(true)}>{t("action.edit")}</Button>
        }
      />
      <div className="p-4 pt-0">
        <DetailRow label={t("billing.region")}>
          {t(`billing.region.${region}` as MessageKey)}
        </DetailRow>
        <DetailRow label={t("doc.type")}>
          <Badge tone={region === "SY" ? "muted" : "accent"}>
            {t(`doc.type.${documentType}` as MessageKey)}
          </Badge>
        </DetailRow>

        {needsDispatch(documentType) && dispatch && (
          <>
            <DetailRow label={t("dispatch.plate")}>
              <Num>{formatPlate(dispatch.vehiclePlate)}</Num>
            </DetailRow>
            <DetailRow label={t("dispatch.driver")}>{dispatch.driverName}</DetailRow>
            {dispatch.carrierName && (
              <DetailRow label={t("dispatch.carrier")}>
                {dispatch.carrierName}
              </DetailRow>
            )}
          </>
        )}

        {/* Readiness. Green is worth showing too — "nothing is wrong" is the
            answer the user is actually looking for before they send. */}
        <div className="mt-3 pt-3 border-t border-line">
          {issues.length === 0 ? (
            <p className="text-2xs text-success">{t("compliance.ok")}</p>
          ) : (
            <>
              <p className="text-2xs text-muted mb-1.5 flex items-center gap-1">
                <IconAlert size={12} className="text-warn" />
                {t("compliance.title")}
              </p>
              <ul className="space-y-1">
                {issues.map((issue) => (
                  <li key={issue.field + issue.code} className="text-2xs text-danger">
                    {t(`compliance.${issue.code}` as MessageKey, {
                      detail: issue.detail ?? "",
                    })}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("billing.region")}
        width="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t("action.cancel")}
            </Button>
            <Button variant="primary" onClick={save} disabled={pending}>
              {t("action.save")}
            </Button>
          </>
        }
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t("billing.region")}>
            <Select
              value={form.billingRegion}
              onChange={(e) => {
                const next = e.target.value as BillingRegion;
                setForm({
                  ...form,
                  billingRegion: next,
                  // The old type belongs to the old regime; an SY document
                  // cannot stay an e-Fatura.
                  documentType: DOCUMENT_TYPES[next][0],
                });
              }}
            >
              {BILLING_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {t(`billing.region.${r}` as MessageKey)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t("doc.type")}>
            <Select
              value={form.documentType}
              onChange={(e) =>
                setForm({
                  ...form,
                  documentType: e.target.value as InvoiceDocumentType,
                })
              }
            >
              {DOCUMENT_TYPES[form.billingRegion].map((d) => (
                <option key={d} value={d}>
                  {t(`doc.type.${d}` as MessageKey)}
                </option>
              ))}
            </Select>
          </Field>

          {needsDispatch(form.documentType) && (
            <>
              <p className="sm:col-span-2 text-2xs text-muted mt-1">
                {t("dispatch.title")}
              </p>
              <Field label={t("dispatch.plate")} required>
                <Input
                  value={form.dispatch.vehiclePlate}
                  placeholder="34 ABC 123"
                  onChange={(e) =>
                    setForm({
                      ...form,
                      dispatch: { ...form.dispatch, vehiclePlate: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label={t("dispatch.driver")} required>
                <Input
                  value={form.dispatch.driverName}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      dispatch: { ...form.dispatch, driverName: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label={t("dispatch.driverTckn")}>
                <Input
                  value={form.dispatch.driverTckn}
                  inputMode="numeric"
                  maxLength={11}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      dispatch: {
                        ...form.dispatch,
                        driverTckn: e.target.value.replace(/\D/g, ""),
                      },
                    })
                  }
                />
              </Field>
              <Field label={t("dispatch.carrier")}>
                <Input
                  value={form.dispatch.carrierName}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      dispatch: { ...form.dispatch, carrierName: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label={t("dispatch.carrierTaxId")}>
                <Input
                  value={form.dispatch.carrierTaxId}
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      dispatch: {
                        ...form.dispatch,
                        carrierTaxId: e.target.value.replace(/\D/g, ""),
                      },
                    })
                  }
                />
              </Field>
              <Field label={t("dispatch.dispatchedAt")}>
                <Input
                  type="datetime-local"
                  value={form.dispatch.dispatchedAt.slice(0, 16)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      dispatch: {
                        ...form.dispatch,
                        // The input gives local time with no zone; store it as
                        // a full ISO string so UBL can split date from time.
                        dispatchedAt: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : "",
                      },
                    })
                  }
                />
              </Field>
              <Field label={t("dispatch.deliveryAddress")} className="sm:col-span-2">
                <Input
                  value={form.dispatch.deliveryAddress}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      dispatch: {
                        ...form.dispatch,
                        deliveryAddress: e.target.value,
                      },
                    })
                  }
                />
              </Field>
            </>
          )}
        </div>
        {error && <p className="text-2xs text-danger mt-3">{error}</p>}
      </Modal>
    </Card>
  );
}
