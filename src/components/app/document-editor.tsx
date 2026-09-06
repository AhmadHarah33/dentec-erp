"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  CurrencyCode,
  DiscountKind,
  DocumentLine,
  Item,
  Settings,
  Warehouse,
} from "@/lib/data/types";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { localName } from "@/lib/labels";
import { computeTotals, formatMoney, formatNumber, rateFor, toBase } from "@/lib/money";
import type { EditorDoc } from "@/lib/doc-defaults";
import { saveInvoice } from "@/app/actions/sales";
import { saveOrder } from "@/app/actions/purchasing";
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
  Textarea,
} from "@/components/ui/primitives";
import { IconClose, IconPlus } from "@/components/ui/icons";

interface Props {
  kind: "sales" | "purchase";
  docId: string | null;
  initial: EditorDoc;
  parties: { id: string; name: string }[];
  items: Item[];
  warehouses: Warehouse[];
  settings: Settings;
  onHand: Record<string, number>;
  locale: string;
}

let seq = 0;
function lineId(): string {
  return `l${Date.now().toString(36)}${seq++}`;
}

export function DocumentEditor({
  kind,
  docId,
  initial,
  parties,
  items,
  warehouses,
  settings,
  onHand,
  locale,
}: Props) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [doc, setDoc] = useState<EditorDoc>(initial);
  const [error, setError] = useState<string | null>(null);

  const isSales = kind === "sales";
  const base = settings.baseCurrency;

  const totals = useMemo(
    () => computeTotals(doc.lines, doc.discountKind, doc.discountValue),
    [doc.lines, doc.discountKind, doc.discountValue],
  );

  const money = (n: number) => formatMoney(n, doc.currency, locale);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  function patch(next: Partial<EditorDoc>) {
    setDoc((d) => ({ ...d, ...next }));
  }

  function patchLine(id: string, next: Partial<DocumentLine>) {
    setDoc((d) => ({
      ...d,
      lines: d.lines.map((l) => (l.id === id ? { ...l, ...next } : l)),
    }));
  }

  function addLine() {
    setDoc((d) => ({
      ...d,
      lines: [
        ...d.lines,
        {
          id: lineId(),
          itemId: null,
          description: "",
          qty: 1,
          unitPrice: 0,
          discountPercent: 0,
          taxRate: isSales ? settings.defaultTaxRate : 0,
        },
      ],
    }));
  }

  function removeLine(id: string) {
    setDoc((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== id) }));
  }

  /**
   * Picking an item fills the line from the catalogue. Sales lines take the
   * selling price, purchase lines the cost — and prices are held in the
   * document's currency, so convert out of base when the doc is not in base.
   */
  function chooseItem(lineIdValue: string, itemId: string) {
    const item = itemById.get(itemId);
    if (!item) {
      patchLine(lineIdValue, { itemId: null });
      return;
    }
    const baseAmount = isSales ? item.price : item.cost;
    patchLine(lineIdValue, {
      itemId,
      description: localName(item, locale),
      unitPrice: Math.round((baseAmount / (doc.fxRate || 1)) * 100) / 100,
      taxRate: isSales ? item.taxRate : 0,
    });
  }

  function changeCurrency(code: CurrencyCode) {
    const rate = rateFor(settings, code);
    // Re-express the existing line prices in the new currency so the document
    // keeps its value instead of silently changing what the customer owes.
    const factor = (doc.fxRate || 1) / (rate || 1);
    setDoc((d) => ({
      ...d,
      currency: code,
      fxRate: rate,
      lines: d.lines.map((l) => ({
        ...l,
        unitPrice: Math.round(l.unitPrice * factor * 100) / 100,
      })),
    }));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const common = {
        warehouseId: doc.warehouseId,
        date: doc.date,
        currency: doc.currency,
        fxRate: doc.fxRate,
        discountKind: doc.discountKind,
        discountValue: doc.discountValue,
        lines: doc.lines,
        notes: doc.notes,
      };

      const result = isSales
        ? await saveInvoice(docId, {
            ...common,
            customerId: doc.partyId,
            dueDate: doc.secondDate,
            status: "draft",
          })
        : await saveOrder(docId, {
            ...common,
            supplierId: doc.partyId,
            expectedDate: doc.secondDate,
            status: "draft",
          });

      if (result.ok) {
        router.push(isSales ? `/invoices/${result.data}` : `/purchases/${result.data}`);
      } else {
        setError(
          t(result.errorKey as MessageKey) + (result.detail ? ` — ${result.detail}` : ""),
        );
      }
    });
  }

  const title = isSales ? t("page.invoices.new") : t("page.purchases.new");
  const partyLabel = isSales ? t("label.customer") : t("label.supplier");
  const secondDateLabel = isSales ? t("label.dueDate") : t("label.expectedDate");

  return (
    <>
      <PageHeader
        title={docId ? t("action.edit") : title}
        subtitle={isSales ? t("page.invoices.subtitle") : t("page.purchases.subtitle")}
        actions={
          <>
            <Button onClick={() => router.back()} disabled={pending}>
              {t("action.cancel")}
            </Button>
            <Button variant="primary" onClick={save} disabled={pending}>
              {t("action.save")}
            </Button>
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader title={t("label.description")} />
          <div className="p-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label={partyLabel} required>
              <Select
                value={doc.partyId}
                onChange={(e) => patch({ partyId: e.target.value })}
              >
                <option value="">—</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("label.warehouse")}>
              <Select
                value={doc.warehouseId}
                onChange={(e) => patch({ warehouseId: e.target.value })}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {localName(w, locale)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("label.date")}>
              <Input
                type="date"
                dir="ltr"
                value={doc.date}
                onChange={(e) => patch({ date: e.target.value })}
              />
            </Field>
            <Field label={secondDateLabel}>
              <Input
                type="date"
                dir="ltr"
                value={doc.secondDate}
                onChange={(e) => patch({ secondDate: e.target.value })}
              />
            </Field>
            <Field label={t("label.currency")}>
              <Select
                value={doc.currency}
                onChange={(e) => changeCurrency(e.target.value as CurrencyCode)}
              >
                <option value={base}>{base}</option>
                {settings.currencies
                  .filter((c) => c.code !== base)
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
              </Select>
            </Field>
            {doc.currency !== base && (
              <Field
                label={t("label.fxRate")}
                hint={`1 ${doc.currency} = ${doc.fxRate} ${base}`}
              >
                <NumberInput
                  value={doc.fxRate}
                  step="0.0001"
                  min={0}
                  onChange={(e) => patch({ fxRate: Number(e.target.value) })}
                />
              </Field>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title={t("label.description")}
            meta={t("msg.rowsCount", { n: doc.lines.length })}
            action={
              <Button size="sm" onClick={addLine}>
                <IconPlus />
                {t("action.addLine")}
              </Button>
            }
          />

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="hairline-b bg-sunken/60 text-2xs text-muted">
                  <th className="h-10 px-2 text-start font-medium min-w-44">
                    {t("label.name")}
                  </th>
                  <th className="h-10 px-2 text-end font-medium w-20">{t("label.qty")}</th>
                  <th className="h-10 px-2 text-end font-medium w-28">
                    {t("label.unitPrice")}
                  </th>
                  <th className="h-10 px-2 text-end font-medium w-20">
                    {t("label.discount")} %
                  </th>
                  <th className="h-10 px-2 text-end font-medium w-20">
                    {t("label.tax")} %
                  </th>
                  <th className="h-10 px-2 text-end font-medium w-28">
                    {t("label.lineTotal")}
                  </th>
                  <th className="h-10 px-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {doc.lines.map((line, index) => {
                  const lineTotal = totals.lines[index];
                  const available = line.itemId ? (onHand[line.itemId] ?? 0) : null;
                  const short = isSales && available !== null && line.qty > available;

                  return (
                    <tr key={line.id} className="hairline-b last:border-b-0 align-top">
                      <td className="px-2 py-1.5">
                        <Select
                          value={line.itemId ?? ""}
                          onChange={(e) => chooseItem(line.id, e.target.value)}
                          className="mb-1"
                        >
                          <option value="">—</option>
                          {items.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.sku} · {localName(i, locale)}
                            </option>
                          ))}
                        </Select>
                        <Input
                          value={line.description}
                          onChange={(e) =>
                            patchLine(line.id, { description: e.target.value })
                          }
                          placeholder={t("label.description")}
                        />
                        {short && (
                          <p className="text-2xs text-danger mt-1">
                            {t("msg.insufficientStock")} —{" "}
                            <Num>{formatNumber(available ?? 0, locale)}</Num>
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <NumberInput
                          value={line.qty}
                          min={0}
                          step="1"
                          onChange={(e) =>
                            patchLine(line.id, { qty: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <NumberInput
                          value={line.unitPrice}
                          min={0}
                          step="0.01"
                          onChange={(e) =>
                            patchLine(line.id, { unitPrice: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <NumberInput
                          value={line.discountPercent}
                          min={0}
                          max={100}
                          onChange={(e) =>
                            patchLine(line.id, {
                              discountPercent: Number(e.target.value),
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <NumberInput
                          value={line.taxRate}
                          min={0}
                          max={100}
                          step="0.5"
                          onChange={(e) =>
                            patchLine(line.id, { taxRate: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5 text-end">
                        <Num className="font-medium leading-8 inline-block">
                          {money(lineTotal?.total ?? 0)}
                        </Num>
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="hover:text-danger"
                          onClick={() => removeLine(line.id)}
                          aria-label={t("action.removeLine")}
                        >
                          <IconClose />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {doc.lines.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-xs text-muted mb-2">{t("empty.lines")}</p>
              <Button onClick={addLine}>
                <IconPlus />
                {t("action.addLine")}
              </Button>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title={t("label.total")} />
            <div className="p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">{t("label.subtotal")}</span>
                <Num>{money(totals.subtotal)}</Num>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted shrink-0">{t("label.discount")}</span>
                <Select
                  value={doc.discountKind}
                  onChange={(e) =>
                    patch({ discountKind: e.target.value as DiscountKind })
                  }
                  className="w-20 h-9"
                >
                  <option value="percent">%</option>
                  <option value="amount">{doc.currency}</option>
                </Select>
                <NumberInput
                  value={doc.discountValue}
                  min={0}
                  step="0.01"
                  onChange={(e) => patch({ discountValue: Number(e.target.value) })}
                  className="h-9"
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">{t("label.net")}</span>
                <Num>{money(totals.net)}</Num>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">{t("label.tax")}</span>
                <Num>{money(totals.tax)}</Num>
              </div>

              <div className="flex items-center justify-between pt-2 hairline-t">
                <span className="text-xs font-semibold">{t("label.total")}</span>
                <Num className="text-base font-semibold">{money(totals.total)}</Num>
              </div>

              {doc.currency !== base && (
                <div className="flex items-center justify-between text-2xs text-faint">
                  <span>{base}</span>
                  <Num>{formatMoney(toBase(totals.total, doc.fxRate), base, locale)}</Num>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={t("label.notes")} />
            <div className="p-3">
              <Textarea
                value={doc.notes}
                onChange={(e) => patch({ notes: e.target.value })}
                rows={4}
              />
            </div>
          </Card>

          {error && (
            <p className="text-2xs text-danger border border-danger-soft bg-danger-soft rounded-sm p-2">
              {error}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

