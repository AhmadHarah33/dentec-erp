"use client";

import { useMemo, useState } from "react";
import type { CurrencyCode, InvoiceStatus, SalesInvoice } from "@/lib/data/types";
import { useT } from "@/lib/i18n/context";
import { INVOICE_STATUSES, INVOICE_TONE, invoiceKey } from "@/lib/labels";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { formatDate, daysOverdue } from "@/lib/dates";
import { PageHeader, StatTile } from "@/components/ui/page";
import { Badge, Input, LinkButton, Num, Select } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { Drawer, DrawerSection } from "@/components/ui/drawer";
import { DetailRow } from "@/components/ui/page";
import { IconAlert, IconCoins, IconDocument, IconPlus } from "@/components/ui/icons";

export interface InvoiceRow {
  invoice: SalesInvoice;
  customerName: string;
  total: number;
  outstanding: number;
}

export function InvoicesClient({
  rows,
  currency,
  locale,
}: {
  rows: InvoiceRow[];
  currency: CurrencyCode;
  locale: string;
}) {
  const t = useT();
  const [open, setOpen] = useState<InvoiceRow | null>(null);
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const money = (n: number) => formatMoney(n, currency, locale);
  const compact = (n: number) => formatMoneyCompact(n, currency, locale);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (status && r.invoice.status !== status) return false;
        if (from && r.invoice.date < from) return false;
        if (to && r.invoice.date > to) return false;
        return true;
      }),
    [rows, status, from, to],
  );

  const stats = useMemo(() => {
    const live = filtered.filter(
      (r) => r.invoice.status !== "draft" && r.invoice.status !== "void",
    );
    return {
      count: filtered.length,
      billed: live.reduce((s, r) => s + r.total, 0),
      outstanding: live.reduce((s, r) => s + r.outstanding, 0),
      overdue: live.filter(
        (r) => r.outstanding > 0.005 && daysOverdue(r.invoice.dueDate) > 0,
      ).length,
    };
  }, [filtered]);

  const columns: Column<InvoiceRow>[] = [
    {
      key: "number",
      header: t("label.number"),
      width: "130px",
      // On a phone you find an invoice by who it is for; the serial is on the
      // card the row opens.
      secondary: true,
      sort: (r) => r.invoice.number,
      search: (r) => r.invoice.number,
      render: (r) => <Num className="font-medium">{r.invoice.number}</Num>,
    },
    {
      key: "date",
      header: t("label.date"),
      width: "110px",
      secondary: true,
      sort: (r) => r.invoice.date,
      render: (r) => (
        <Num className="text-muted text-2xs">{formatDate(r.invoice.date, locale)}</Num>
      ),
    },
    {
      key: "customer",
      header: t("label.customer"),
      sort: (r) => r.customerName,
      search: (r) => r.customerName,
      render: (r) => <span className="truncate">{r.customerName}</span>,
    },
    {
      key: "due",
      header: t("label.dueDate"),
      width: "120px",
      tertiary: true,
      sort: (r) => r.invoice.dueDate,
      render: (r) => {
        const late =
          r.outstanding > 0.005 &&
          r.invoice.status !== "draft" &&
          r.invoice.status !== "void" &&
          daysOverdue(r.invoice.dueDate) > 0;
        return (
          <Num className={late ? "text-danger" : "text-muted text-2xs"}>
            {formatDate(r.invoice.dueDate, locale)}
          </Num>
        );
      },
    },
    {
      key: "status",
      header: t("label.status"),
      width: "110px",
      sort: (r) => r.invoice.status,
      render: (r) => (
        <Badge tone={INVOICE_TONE[r.invoice.status]}>{t(invoiceKey(r.invoice.status))}</Badge>
      ),
    },
    {
      key: "currency",
      header: t("label.currency"),
      width: "70px",
      tertiary: true,
      sort: (r) => r.invoice.currency,
      render: (r) =>
        r.invoice.currency === currency ? (
          <span className="text-faint text-2xs">—</span>
        ) : (
          // Only worth showing when it differs from the books' currency.
          <Num className="text-2xs text-muted">{r.invoice.currency}</Num>
        ),
    },
    {
      key: "total",
      header: t("label.total"),
      align: "end",
      width: "130px",
      secondary: true,
      sort: (r) => r.total,
      render: (r) => <Num className="font-medium">{money(r.total)}</Num>,
    },
    {
      key: "outstanding",
      header: t("label.balance"),
      align: "end",
      width: "130px",
      sort: (r) => r.outstanding,
      render: (r) => (
        <Num className={r.outstanding > 0.005 ? "text-danger" : "text-faint"}>
          {money(r.outstanding)}
        </Num>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("page.invoices.title")}
        subtitle={t("page.invoices.subtitle")}
        actions={
          <LinkButton href="/invoices/new" variant="primary">
            <IconPlus />
            {t("page.invoices.new")}
          </LinkButton>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile
          label={t("nav.invoices")}
          value={String(stats.count)}
          icon={IconDocument}
        />
        <StatTile
          label={t("report.revenue")}
          value={compact(stats.billed)}
          icon={IconCoins}
          tone="success"
        />
        <StatTile
          label={t("dash.receivables")}
          value={compact(stats.outstanding)}
          icon={IconCoins}
          tone={stats.outstanding > 0 ? "warn" : "success"}
          chip={stats.outstanding > 0 ? t("dash.tileWatch") : t("dash.tileGood")}
        />
        <StatTile
          label={t("status.overdue")}
          value={String(stats.overdue)}
          icon={IconAlert}
          tone={stats.overdue > 0 ? "danger" : "success"}
          chip={stats.overdue > 0 ? t("dash.tileBad") : t("dash.tileGood")}
        />
      </div>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.invoice.id}
        onRowClick={(r) => setOpen(r)}
        pageSize={30}
        emptyTitle={t("empty.invoices")}
        emptyAction={
          <LinkButton href="/invoices/new" variant="primary">
            {t("page.invoices.new")}
          </LinkButton>
        }
        filters={
          <>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as InvoiceStatus | "")}
              className="w-36"
              aria-label={t("label.status")}
            >
              <option value="">{t("label.all")}</option>
              {INVOICE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(invoiceKey(s))}
                </option>
              ))}
            </Select>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-36"
              dir="ltr"
              aria-label={t("label.date")}
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-36"
              dir="ltr"
              aria-label={t("label.dueDate")}
            />
          </>
        }
      />

      <Drawer
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.invoice.number ?? ""}
        meta={open?.customerName}
        badge={
          open && (
            <Badge tone={INVOICE_TONE[open.invoice.status]}>
              {t(invoiceKey(open.invoice.status))}
            </Badge>
          )
        }
        footer={
          open && (
            <LinkButton href={"/invoices/" + open.invoice.id} variant="primary" className="w-full">
              {t("action.openFull")}
            </LinkButton>
          )
        }
      >
        {open && (
          <>
            <DrawerSection>
              <DetailRow label={t("label.customer")}>{open.customerName}</DetailRow>
              <DetailRow label={t("label.date")}>
                <Num>{formatDate(open.invoice.date, locale)}</Num>
              </DetailRow>
              <DetailRow label={t("label.dueDate")}>
                <Num
                  className={
                    open.outstanding > 0.005 && daysOverdue(open.invoice.dueDate) > 0
                      ? "text-danger"
                      : undefined
                  }
                >
                  {formatDate(open.invoice.dueDate, locale)}
                </Num>
              </DetailRow>
              <DetailRow label={t("label.currency")}>
                <Num>{open.invoice.currency}</Num>
              </DetailRow>
            </DrawerSection>

            <DrawerSection title={t("label.total")}>
              <DetailRow label={t("label.total")}>
                <Num className="font-semibold">{money(open.total)}</Num>
              </DetailRow>
              {/* A draft or a voided invoice has no outstanding balance by
                  definition, so reporting it as fully paid would be a lie. */}
              {open.invoice.status !== "draft" && open.invoice.status !== "void" && (
                <>
                  <DetailRow label={t("label.paid")}>
                    <Num>{money(open.total - open.outstanding)}</Num>
                  </DetailRow>
                  <DetailRow label={t("label.balance")}>
                    <Num
                      className={
                        open.outstanding > 0.005 ? "text-danger font-semibold" : undefined
                      }
                    >
                      {money(open.outstanding)}
                    </Num>
                  </DetailRow>
                </>
              )}
            </DrawerSection>

            <DrawerSection title={t("label.lines")}>
              {open.invoice.lines.map((line) => (
                <DetailRow key={line.id} label={line.description || "—"}>
                  <Num>
                    {line.qty} × {money(line.unitPrice)}
                  </Num>
                </DetailRow>
              ))}
            </DrawerSection>

            {open.invoice.notes && (
              <DrawerSection title={t("label.notes")}>
                <p className="text-2xs text-muted leading-relaxed py-2">{open.invoice.notes}</p>
              </DrawerSection>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
