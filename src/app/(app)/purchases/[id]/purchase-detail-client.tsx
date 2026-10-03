"use client";

import { useTransition, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Item, PurchaseOrder, Settings, Supplier, Warehouse } from "@/lib/data/types";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { localName, PURCHASE_TONE, purchaseKey } from "@/lib/labels";
import { formatMoney, computeTotals, toBase } from "@/lib/money";
import { receiveOrder, cancelOrder, deleteOrder } from "@/app/actions/purchasing";
import { today, formatDate, formatDateTime } from "@/lib/dates";
import { DetailRow, EmptyState, PageHeader } from "@/components/ui/page";
import { Badge, Card, CardHeader, Num, LinkButton, Button } from "@/components/ui/primitives";
import { Confirm } from "@/components/ui/modal";
import { DownloadPdfButton } from "@/components/app/download-pdf";
import { useToast } from "@/components/ui/toast";

export function PurchaseDetailClient({
  order,
  job,
  supplier,
  warehouse,
  items,
  settings,
  locale,
}: {
  order: PurchaseOrder;
  /** The service job this order was drafted for, when it was. */
  job: { id: string; number: string } | null;
  supplier: Supplier;
  warehouse: Warehouse;
  items: Item[];
  settings: Settings;
  locale: string;
}) {
  const t = useT();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  // Fixed at today: a receipt is recorded when the goods arrive.
  const [receiveDate] = useState(today());

  const money = (n: number) => formatMoney(n, order.currency, locale);
  const baseMoney = (n: number) => formatMoney(n, settings.baseCurrency, locale);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const totals = useMemo(
    () => computeTotals(order.lines, order.discountKind, order.discountValue),
    [order],
  );

  const canReceive = order.status === "draft" || order.status === "ordered";
  const canCancel = order.status !== "received" && order.status !== "cancelled";

  const canDelete = order.status === "draft";

  // Every outcome closes the dialog; a failure is shown under the header
  // rather than swallowed, which is what this page used to do.
  function run(
    action: () => Promise<{ ok: boolean; errorKey?: string; detail?: string }>,
    onOk: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      setReceiveOpen(false);
      setCancelOpen(false);
      setDeleteOpen(false);
      if (result.ok) onOk();
      else setError(t(result.errorKey as MessageKey) + (result.detail ? ` — ${result.detail}` : ""));
    });
  }

  const handleReceive = () =>
    run(() => receiveOrder(order.id, receiveDate), () => toast(t("msg.received")));
  const handleCancel = () =>
    run(() => cancelOrder(order.id), () => toast(t("msg.cancelled")));
  const handleDelete = () =>
    run(() => deleteOrder(order.id), () => {
      toast(t("msg.deleted"));
      router.push("/purchases");
    });

  const showBase = order.currency !== settings.baseCurrency;

  return (
    <>
      <PageHeader
        title={order.number}
        subtitle={`${supplier.name} · ${formatDate(order.date, locale)}`}
        actions={
          <>
            <Badge tone={PURCHASE_TONE[order.status]}>{t(purchaseKey(order.status))}</Badge>
            <LinkButton href="/purchases">{t("action.back")}</LinkButton>
            <DownloadPdfButton kind="purchases" id={order.id} />
            {canDelete && (
              <Button variant="danger" onClick={() => setDeleteOpen(true)} disabled={pending}>
                {t("action.delete")}
              </Button>
            )}
            {canCancel && !canDelete && (
              <Button variant="danger" onClick={() => setCancelOpen(true)} disabled={pending}>
                {t("action.cancelOrder")}
              </Button>
            )}
            {canReceive && (
              <Button variant="primary" onClick={() => setReceiveOpen(true)} disabled={pending}>
                {t("action.receive")}
              </Button>
            )}
          </>
        }
      />

      {error && (
        <p className="text-2xs text-danger border border-danger-soft bg-danger-soft rounded-sm p-2 mb-4 no-print">
          {error}
        </p>
      )}

      <Card className="mb-4">
        <CardHeader title={t("label.details")} />
        <div className="px-3 py-1 divide-y divide-line">
          <DetailRow label={t("label.supplier")}>
            {supplier.name}
          </DetailRow>
          <DetailRow label={t("label.warehouse")}>
            {localName(warehouse, locale)}
          </DetailRow>
          <DetailRow label={t("label.date")}>
            <Num>{formatDate(order.date, locale)}</Num>
          </DetailRow>
          <DetailRow label={t("label.expectedDate")}>
            <Num>{formatDate(order.expectedDate, locale)}</Num>
          </DetailRow>
          <DetailRow label={t("label.currency")}>
            {order.currency}
          </DetailRow>
          <DetailRow label={t("label.fxRate")}>
            <Num>{formatMoney(order.fxRate || 1, "USD", locale)}</Num>
          </DetailRow>
          <DetailRow label={t("label.status")}>
            <Badge tone={PURCHASE_TONE[order.status]}>
              {t(purchaseKey(order.status))}
            </Badge>
          </DetailRow>
          {order.receivedAt && (
            <DetailRow label={t("action.receive")}>
              <Num>{formatDateTime(order.receivedAt, locale)}</Num>
            </DetailRow>
          )}
          {job && (
            <DetailRow label={t("service.linkedJob")}>
              <Link href={`/service/${job.id}`} className="text-accent hover:underline">
                <Num>{job.number}</Num>
              </Link>
            </DetailRow>
          )}
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader title={t("label.lines")} />
        {order.lines.length === 0 ? (
          <EmptyState compact title={t("empty.lines")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="hairline-b bg-sunken/60 text-2xs text-muted">
                  <th className="h-10 px-3 text-start font-medium">{t("label.name")}</th>
                  <th className="h-10 px-3 text-start font-medium">{t("label.description")}</th>
                  <th className="h-10 px-3 text-end font-medium">{t("label.qty")}</th>
                  <th className="h-10 px-3 text-end font-medium">{t("label.unitPrice")}</th>
                  <th className="h-10 px-3 text-end font-medium">{t("label.discount")}</th>
                  <th className="h-10 px-3 text-end font-medium">{t("label.total")}</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line, idx) => {
                  const item = line.itemId ? itemById.get(line.itemId) : null;
                  const lineTotal = totals.lines[idx];
                  return (
                    <tr key={line.id} className="hairline-b last:border-b-0">
                      <td className="h-11 px-3">
                        <span>
                          {item ? localName(item, locale) : "—"}
                          {item && <span className="ms-2"><Num className="text-2xs text-faint">{item.sku}</Num></span>}
                        </span>
                      </td>
                      <td className="h-11 px-3 text-muted text-2xs">{line.description || "—"}</td>
                      <td className="h-11 px-3 text-end">
                        <Num>{line.qty}</Num>
                      </td>
                      <td className="h-11 px-3 text-end">
                        <Num>{money(line.unitPrice)}</Num>
                      </td>
                      <td className="h-11 px-3 text-end">
                        <Num>{line.discountPercent || "—"}</Num>
                      </td>
                      <td className="h-11 px-3 text-end">
                        <Num className="font-medium">{money(lineTotal.total)}</Num>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {order.lines.length > 0 && (
          <div className="px-3 py-2 bg-surface border-t border-line">
            <div className="space-y-1 text-xs divide-y divide-line">
              <div className="py-1.5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-muted">{t("label.subtotal")}</span>
                  <span className="text-end">
                    <Num>{money(totals.subtotal)}</Num>
                    {showBase && (
                      <span className="text-2xs text-faint ms-2">
                        <Num>{baseMoney(toBase(totals.subtotal, order.fxRate))}</Num>
                      </span>
                    )}
                  </span>
                </div>
              </div>
              {totals.discount > 0 && (
                <div className="py-1.5">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-muted">{t("label.discount")}</span>
                    <span className="text-end">
                      <Num>−{money(totals.discount)}</Num>
                      {showBase && (
                        <span className="text-2xs text-faint ms-2">
                          <Num>−{baseMoney(toBase(totals.discount, order.fxRate))}</Num>
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )}
              <div className="py-1.5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-muted">{t("label.net")}</span>
                  <span className="text-end">
                    <Num>{money(totals.net)}</Num>
                    {showBase && (
                      <span className="text-2xs text-faint ms-2">
                        <Num>{baseMoney(toBase(totals.net, order.fxRate))}</Num>
                      </span>
                    )}
                  </span>
                </div>
              </div>
              {totals.tax > 0 && (
                <div className="py-1.5">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-muted">{t("label.tax")}</span>
                    <span className="text-end">
                      <Num>{money(totals.tax)}</Num>
                      {showBase && (
                        <span className="text-2xs text-faint ms-2">
                          <Num>{baseMoney(toBase(totals.tax, order.fxRate))}</Num>
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )}
              <div className="py-1.5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium">{t("label.total")}</span>
                  <span className="text-end">
                    <Num className="font-medium">{money(totals.total)}</Num>
                    {showBase && (
                      <span className="text-2xs text-faint ms-2">
                        <Num>{baseMoney(toBase(totals.total, order.fxRate))}</Num>
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Confirm
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        onConfirm={handleReceive}
        title={t("action.receive")}
        message={t("msg.confirmReceive")}
        confirmLabel={t("action.receive")}
        tone="primary"
        pending={pending}
      />

      <Confirm
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancel}
        title={t("action.cancelOrder")}
        message={t("msg.confirmCancelOrder")}
        confirmLabel={t("action.cancelOrder")}
        tone="danger"
        pending={pending}
      />

      <Confirm
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={t("action.delete")}
        message={t("msg.confirmDeleteHint")}
        confirmLabel={t("action.delete")}
        tone="danger"
        pending={pending}
      />
    </>
  );
}
