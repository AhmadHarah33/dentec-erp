"use client";

import { useMemo, useState, useTransition } from "react";
import type {
  Customer,
  CurrencyCode,
  Expense,
  Payment,
  SalesInvoice,
  Supplier,
} from "@/lib/data/types";
import type { AgingRow } from "@/lib/queries";
import { AGING_BUCKETS } from "@/lib/queries";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
} from "@/lib/labels";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { formatDate, today } from "@/lib/dates";
import { savePayment, deletePayment, saveExpense, deleteExpense } from "@/app/actions/finance";
import { PageHeader, StatTile } from "@/components/ui/page";
import { IconCoins, IconArrowDown, IconArrowUp, IconDocument } from "@/components/ui/icons";
import {
  Badge,
  Button,
  Field,
  Input,
  NumberInput,
  Segmented,
  Select,
  Num,
  Textarea,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { Modal, Confirm } from "@/components/ui/modal";
import { StackBar } from "@/components/ui/charts";
import { paymentBase, expenseBase } from "@/lib/queries";

interface PaymentForm {
  date: string;
  direction: "in" | "out" | "";
  partyType: "customer" | "supplier" | "";
  partyId: string;
  amount: number;
  currency: CurrencyCode;
  fxRate: number;
  method: string;
  reference: string;
  note: string;
}

interface ExpenseForm {
  date: string;
  category: string;
  amount: number;
  currency: CurrencyCode;
  fxRate: number;
  method: string;
  description: string;
}

export function AccountingClient({
  payments,
  expenses,
  customers,
  suppliers,
  salesInvoices,
  agingRows,
  currency,
  currencies,
  locale,
}: {
  payments: Payment[];
  expenses: Expense[];
  customers: Customer[];
  suppliers: Supplier[];
  salesInvoices: SalesInvoice[];
  agingRows: AgingRow[];
  currency: CurrencyCode;
  currencies: { code: CurrencyCode; rate: number }[];
  locale: string;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();

  // Tab state
  const [activeTab, setActiveTab] = useState<"payments" | "expenses" | "aging">("payments");

  // Payment modal
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [deletePaymentConfirm, setDeletePaymentConfirm] = useState<Payment | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({
    date: today(),
    direction: "",
    partyType: "",
    partyId: "",
    amount: 0,
    currency,
    fxRate: 1,
    method: "",
    reference: "",
    note: "",
  });
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Expense modal
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deleteExpenseConfirm, setDeleteExpenseConfirm] = useState<Expense | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>({
    date: today(),
    category: "",
    amount: 0,
    currency,
    fxRate: 1,
    method: "",
    description: "",
  });
  const [expenseError, setExpenseError] = useState<string | null>(null);

  // Payment filters
  const [paymentDirection, setPaymentDirection] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentFrom, setPaymentFrom] = useState("");
  const [paymentTo, setPaymentTo] = useState("");

  // Expense filters
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseFrom, setExpenseFrom] = useState("");
  const [expenseTo, setExpenseTo] = useState("");

  const money = (n: number) => formatMoney(n, currency, locale);
  const compact = (n: number) => formatMoneyCompact(n, currency, locale);

  // ===== Payments Tab =====

  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);
  const invoiceById = useMemo(
    () => new Map(salesInvoices.map((i) => [i.id, i])),
    [salesInvoices],
  );

  const filteredPayments = useMemo(
    () =>
      payments.filter((p) => {
        if (paymentDirection && p.direction !== paymentDirection) return false;
        if (paymentMethod && p.method !== paymentMethod) return false;
        if (paymentFrom && p.date < paymentFrom) return false;
        if (paymentTo && p.date > paymentTo) return false;
        return true;
      }),
    [payments, paymentDirection, paymentMethod, paymentFrom, paymentTo],
  );

  const cashIn = useMemo(
    () =>
      filteredPayments
        .filter((p) => p.direction === "in")
        .reduce((s, p) => s + paymentBase(p), 0),
    [filteredPayments],
  );

  const cashOut = useMemo(
    () =>
      filteredPayments
        .filter((p) => p.direction === "out")
        .reduce((s, p) => s + paymentBase(p), 0),
    [filteredPayments],
  );

  const expensesTotal = useMemo(
    () =>
      expenses
        .filter((e) => {
          if (expenseCategory && e.category !== expenseCategory) return false;
          if (expenseFrom && e.date < expenseFrom) return false;
          if (expenseTo && e.date > expenseTo) return false;
          return true;
        })
        .reduce((s, e) => s + expenseBase(e), 0),
    [expenses, expenseCategory, expenseFrom, expenseTo],
  );

  const netCash = cashIn - cashOut - expensesTotal;

  function openNewPayment() {
    setEditingPayment(null);
    setPaymentForm({
      date: today(),
      direction: "",
      partyType: "",
      partyId: "",
      amount: 0,
      currency,
      fxRate: 1,
      method: "",
      reference: "",
      note: "",
    });
    setPaymentError(null);
    setPaymentModalOpen(true);
  }

  function openEditPayment(p: Payment) {
    setEditingPayment(p);
    setPaymentForm({
      date: p.date,
      direction: p.direction,
      partyType: p.partyType,
      partyId: p.partyId,
      amount: p.amount,
      currency: p.currency,
      fxRate: p.fxRate,
      method: p.method,
      reference: p.reference,
      note: p.note,
    });
    setPaymentError(null);
    setPaymentModalOpen(true);
  }

  function handlePaymentCurrencyChange(code: CurrencyCode) {
    const newRate = currencies.find((c) => c.code === code)?.rate ?? 1;
    setPaymentForm((f) => ({
      ...f,
      currency: code,
      fxRate: newRate,
    }));
  }

  function submitPayment() {
    setPaymentError(null);
    startTransition(async () => {
      const result = await savePayment(editingPayment?.id ?? null, {
        date: paymentForm.date,
        direction: paymentForm.direction as "in" | "out",
        partyType: paymentForm.partyType as "customer" | "supplier",
        partyId: paymentForm.partyId,
        invoiceId: null,
        amount: paymentForm.amount,
        currency: paymentForm.currency,
        fxRate: paymentForm.fxRate,
        method: paymentForm.method as any,
        reference: paymentForm.reference,
        note: paymentForm.note,
      });

      if (result.ok) {
        setPaymentModalOpen(false);
      } else {
        setPaymentError(t(result.errorKey as MessageKey));
      }
    });
  }

  function submitDeletePayment() {
    if (!deletePaymentConfirm) return;
    startTransition(async () => {
      const result = await deletePayment(
        deletePaymentConfirm.id,
        deletePaymentConfirm.invoiceId,
      );
      if (result.ok) {
        setDeletePaymentConfirm(null);
      }
    });
  }

  function openNewExpense() {
    setEditingExpense(null);
    setExpenseForm({
      date: today(),
      category: "",
      amount: 0,
      currency,
      fxRate: 1,
      method: "",
      description: "",
    });
    setExpenseError(null);
    setExpenseModalOpen(true);
  }

  function openEditExpense(e: Expense) {
    setEditingExpense(e);
    setExpenseForm({
      date: e.date,
      category: e.category,
      amount: e.amount,
      currency: e.currency,
      fxRate: e.fxRate,
      method: e.method,
      description: e.description,
    });
    setExpenseError(null);
    setExpenseModalOpen(true);
  }

  function handleExpenseCurrencyChange(code: CurrencyCode) {
    const newRate = currencies.find((c) => c.code === code)?.rate ?? 1;
    setExpenseForm((f) => ({
      ...f,
      currency: code,
      fxRate: newRate,
    }));
  }

  function submitExpense() {
    setExpenseError(null);
    startTransition(async () => {
      const result = await saveExpense(editingExpense?.id ?? null, {
        date: expenseForm.date,
        category: expenseForm.category as any,
        amount: expenseForm.amount,
        currency: expenseForm.currency,
        fxRate: expenseForm.fxRate,
        method: expenseForm.method as any,
        description: expenseForm.description,
      });

      if (result.ok) {
        setExpenseModalOpen(false);
      } else {
        setExpenseError(t(result.errorKey as MessageKey));
      }
    });
  }

  function submitDeleteExpense() {
    if (!deleteExpenseConfirm) return;
    startTransition(async () => {
      const result = await deleteExpense(deleteExpenseConfirm.id);
      if (result.ok) {
        setDeleteExpenseConfirm(null);
      }
    });
  }

  // Payment columns
  const paymentColumns: Column<Payment>[] = [
    {
      key: "date",
      header: t("label.date"),
      width: "110px",
      sort: (p) => p.date + p.createdAt,
      render: (p) => (
        <button
          onClick={() => openEditPayment(p)}
          className="text-2xs text-muted hover:text-accent hover:underline text-start"
        >
          <Num>{formatDate(p.date, locale)}</Num>
        </button>
      ),
    },
    {
      key: "direction",
      header: t("label.type"),
      width: "90px",
      secondary: true,
      sort: (p) => p.direction,
      render: (p) => (
        <Badge tone={p.direction === "in" ? "accent" : "neutral"}>
          {t(p.direction === "in" ? "payment.in" : "payment.out")}
        </Badge>
      ),
    },
    {
      key: "party",
      header: t("label.customer"),
      sort: (p) => {
        const party =
          p.partyType === "customer"
            ? customerById.get(p.partyId)
            : supplierById.get(p.partyId);
        return party?.name ?? "";
      },
      search: (p) => {
        const party =
          p.partyType === "customer"
            ? customerById.get(p.partyId)
            : supplierById.get(p.partyId);
        return party?.name ?? "";
      },
      render: (p) => {
        const party =
          p.partyType === "customer"
            ? customerById.get(p.partyId)
            : supplierById.get(p.partyId);
        return <span className="truncate">{party?.name || "—"}</span>;
      },
    },
    {
      key: "invoice",
      header: t("label.number"),
      width: "110px",
      secondary: true,
      render: (p) => {
        const invoice = p.invoiceId ? invoiceById.get(p.invoiceId) : null;
        return invoice ? <Num className="text-2xs">{invoice.number}</Num> : <span className="text-faint text-2xs">—</span>;
      },
    },
    {
      key: "method",
      header: t("label.method"),
      width: "100px",
      tertiary: true,
      sort: (p) => p.method,
      render: (p) => <span className="text-2xs text-muted">{t(`method.${p.method}`)}</span>,
    },
    {
      key: "reference",
      header: t("label.reference"),
      width: "100px",
      tertiary: true,
      sort: (p) => p.reference,
      search: (p) => p.reference,
      render: (p) => <Num className="text-2xs text-muted">{p.reference || "—"}</Num>,
    },
    {
      key: "amount",
      header: t("label.amount"),
      align: "end",
      width: "130px",
      sort: (p) => paymentBase(p),
      render: (p) => {
        const base = paymentBase(p);
        return (
          <div>
            <Num className="font-medium">
              {p.currency === currency
                ? money(p.amount)
                : `${formatMoney(p.amount, p.currency, locale)}`}
            </Num>
            {p.currency !== currency && (
              <Num className="text-2xs text-faint">{money(base)}</Num>
            )}
          </div>
        );
      },
    },
  ];

  // Expense columns
  const expenseColumns: Column<Expense>[] = [
    {
      key: "date",
      header: t("label.date"),
      width: "110px",
      sort: (e) => e.date + e.createdAt,
      render: (e) => (
        <button
          onClick={() => openEditExpense(e)}
          className="text-2xs text-muted hover:text-accent hover:underline text-start"
        >
          <Num>{formatDate(e.date, locale)}</Num>
        </button>
      ),
    },
    {
      key: "category",
      header: t("label.category"),
      width: "100px",
      sort: (e) => e.category,
      render: (e) => (
        <Badge tone="neutral">{t(`expense.${e.category}`)}</Badge>
      ),
    },
    {
      key: "description",
      header: t("label.description"),
      sort: (e) => e.description,
      search: (e) => e.description,
      render: (e) => <span className="truncate text-xs">{e.description}</span>,
    },
    {
      key: "method",
      header: t("label.method"),
      width: "100px",
      tertiary: true,
      sort: (e) => e.method,
      render: (e) => <span className="text-2xs text-muted">{t(`method.${e.method}`)}</span>,
    },
    {
      key: "amount",
      header: t("label.amount"),
      align: "end",
      width: "130px",
      sort: (e) => expenseBase(e),
      render: (e) => {
        const base = expenseBase(e);
        return (
          <div>
            <Num className="font-medium">
              {e.currency === currency
                ? money(e.amount)
                : `${formatMoney(e.amount, e.currency, locale)}`}
            </Num>
            {e.currency !== currency && (
              <Num className="text-2xs text-faint">{money(base)}</Num>
            )}
          </div>
        );
      },
    },
  ];

  // Aging totals row
  const agingTotals = useMemo(() => {
    const result: Record<string, number> = {
      total: 0,
    };
    for (const bucket of AGING_BUCKETS) {
      result[bucket] = agingRows.reduce((s, r) => s + r.buckets[bucket], 0);
    }
    result.total = agingRows.reduce((s, r) => s + r.total, 0);
    return result;
  }, [agingRows]);

  // Aging stack bar segments
  const stackBarSegments = useMemo(
    () => [
      {
        label: t("aging.current"),
        value: agingTotals.current,
        color: "var(--color-line-strong)",
      },
      {
        label: t("aging.d30"),
        value: agingTotals.d30,
        color: "var(--color-accent)",
      },
      {
        label: t("aging.d60"),
        value: agingTotals.d60,
        color: "var(--color-warn)",
      },
      {
        label: t("aging.d90"),
        value: agingTotals.d90,
        color: "#c9793f",
      },
      {
        label: t("aging.d90plus"),
        value: agingTotals.d90plus,
        color: "var(--color-danger)",
      },
    ],
    [agingTotals, t],
  );

  const filteredExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        if (expenseCategory && e.category !== expenseCategory) return false;
        if (expenseFrom && e.date < expenseFrom) return false;
        if (expenseTo && e.date > expenseTo) return false;
        return true;
      }),
    [expenses, expenseCategory, expenseFrom, expenseTo],
  );

  return (
    <>
      <PageHeader
        title={t("page.accounting.title")}
        subtitle={t("page.accounting.subtitle")}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile
          label={t("page.accounting.cashIn")}
          value={compact(cashIn)}
          icon={IconArrowDown}
          tone="success"
        />
        <StatTile
          label={t("page.accounting.cashOut")}
          value={compact(cashOut)}
          icon={IconArrowUp}
        />
        <StatTile
          label={t("page.accounting.expensesTotal")}
          value={compact(expensesTotal)}
          icon={IconDocument}
        />
        <StatTile
          label={t("page.accounting.netCash")}
          value={compact(netCash)}
          icon={IconCoins}
          tone={netCash < 0 ? "danger" : "success"}
          chip={netCash < 0 ? t("dash.tileBad") : t("dash.tileGood")}
        />
      </div>

      <div className="mb-6">
        <Segmented
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel={t("page.accounting.title")}
          options={[
            { value: "payments", label: t("page.accounting.payments") },
            { value: "expenses", label: t("page.accounting.expenses") },
            { value: "aging", label: t("page.accounting.aging") },
          ]}
        />
      </div>

      {/* Tab: Payments */}
      {activeTab === "payments" && (
        <DataTable
          rows={filteredPayments}
          columns={paymentColumns}
          rowKey={(p) => p.id}
          pageSize={30}
          emptyTitle={t("empty.payments")}
          emptyAction={
            <Button variant="primary" onClick={openNewPayment}>
              {t("page.accounting.newPayment")}
            </Button>
          }
          filters={
            <>
              <Select
                value={paymentDirection}
                onChange={(e) => setPaymentDirection(e.target.value)}
                className="w-32"
                aria-label={t("label.type")}
              >
                <option value="">{t("label.all")}</option>
                <option value="in">{t("payment.in")}</option>
                <option value="out">{t("payment.out")}</option>
              </Select>
              <Select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-32"
                aria-label={t("label.method")}
              >
                <option value="">{t("label.all")}</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`method.${m}`)}
                  </option>
                ))}
              </Select>
              <Input
                type="date"
                value={paymentFrom}
                onChange={(e) => setPaymentFrom(e.target.value)}
                placeholder={t("label.date")}
                dir="ltr"
                className="w-32"
              />
              <Input
                type="date"
                value={paymentTo}
                onChange={(e) => setPaymentTo(e.target.value)}
                placeholder={t("label.date")}
                dir="ltr"
                className="w-32"
              />
            </>
          }
        />
      )}

      {/* Tab: Expenses */}
      {activeTab === "expenses" && (
        <DataTable
          rows={filteredExpenses}
          columns={expenseColumns}
          rowKey={(e) => e.id}
          pageSize={30}
          emptyTitle={t("empty.expenses")}
          emptyAction={
            <Button variant="primary" onClick={openNewExpense}>
              {t("page.accounting.newExpense")}
            </Button>
          }
          filters={
            <>
              <Select
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value)}
                className="w-40"
                aria-label={t("label.category")}
              >
                <option value="">{t("label.all")}</option>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {t(`expense.${cat}`)}
                  </option>
                ))}
              </Select>
              <Input
                type="date"
                value={expenseFrom}
                onChange={(e) => setExpenseFrom(e.target.value)}
                placeholder={t("label.date")}
                dir="ltr"
                className="w-32"
              />
              <Input
                type="date"
                value={expenseTo}
                onChange={(e) => setExpenseTo(e.target.value)}
                placeholder={t("label.date")}
                dir="ltr"
                className="w-32"
              />
            </>
          }
        />
      )}

      {/* Tab: Aging */}
      {activeTab === "aging" && (
        <>
          <div className="mb-6">
            <StackBar segments={stackBarSegments} />
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3 text-2xs">
              {stackBarSegments.map((seg) => (
                <div key={seg.label} className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="text-muted">{seg.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="h-10 border-b border-line-strong">
                  <th className="text-start ps-2 font-medium text-muted">
                    {t("label.customer")}
                  </th>
                  {AGING_BUCKETS.map((bucket) => (
                    <th key={bucket} className="text-end pe-2 font-medium text-muted">
                      {t(`aging.${bucket}`)}
                    </th>
                  ))}
                  <th className="text-end pe-2 font-medium text-muted">
                    {t("label.total")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {agingRows.map((row) => (
                  <tr key={row.partyId} className="h-11 border-b border-line hover:bg-sunken/50">
                    <td className="ps-2 truncate">{row.name}</td>
                    {AGING_BUCKETS.map((bucket) => (
                      <td key={bucket} className="text-end pe-2">
                        <Num
                          className={
                            row.buckets[bucket] === 0 ? "text-faint" : "font-medium"
                          }
                        >
                          {money(row.buckets[bucket])}
                        </Num>
                      </td>
                    ))}
                    <td className="text-end pe-2">
                      <Num className="font-medium">{money(row.total)}</Num>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="h-10 border-t border-line-strong bg-sunken/50">
                  <th className="ps-2 text-start font-medium text-muted">
                    {t("label.total")}
                  </th>
                  {AGING_BUCKETS.map((bucket) => (
                    <th key={bucket} className="text-end pe-2 font-medium">
                      <Num>{money(agingTotals[bucket])}</Num>
                    </th>
                  ))}
                  <th className="text-end pe-2 font-medium">
                    <Num>{money(agingTotals.total)}</Num>
                  </th>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {/* Payment Modal */}
      <Modal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        title={editingPayment ? t("action.edit") : t("page.accounting.newPayment")}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setPaymentModalOpen(false)}
              disabled={pending}
            >
              {t("action.cancel")}
            </Button>
            {editingPayment && (
              <Button
                variant="danger"
                onClick={() => setDeletePaymentConfirm(editingPayment)}
                disabled={pending}
              >
                {t("action.delete")}
              </Button>
            )}
            <Button variant="primary" onClick={submitPayment} disabled={pending}>
              {t("action.save")}
            </Button>
          </>
        }
      >
        {paymentError && (
          <div className="mb-3 p-2 bg-danger-soft text-danger rounded-sm text-2xs">
            {paymentError}
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t("label.date")} required>
            <Input
              type="date"
              value={paymentForm.date}
              onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
              dir="ltr"
            />
          </Field>
          <Field label={t("label.type")} required>
            <Select
              value={paymentForm.direction}
              onChange={(e) =>
                setPaymentForm({
                  ...paymentForm,
                  direction: e.target.value as "in" | "out" | "",
                })
              }
            >
              <option value="">—</option>
              <option value="in">{t("payment.in")}</option>
              <option value="out">{t("payment.out")}</option>
            </Select>
          </Field>
          <Field label={t("label.type")} required>
            <Select
              value={paymentForm.partyType}
              onChange={(e) =>
                setPaymentForm({
                  ...paymentForm,
                  partyType: e.target.value as "customer" | "supplier" | "",
                  partyId: "",
                })
              }
            >
              <option value="">—</option>
              <option value="customer">{t("label.customer")}</option>
              <option value="supplier">{t("label.supplier")}</option>
            </Select>
          </Field>
          <Field label={t("label.customer")} required>
            <Select
              value={paymentForm.partyId}
              onChange={(e) => setPaymentForm({ ...paymentForm, partyId: e.target.value })}
            >
              <option value="">—</option>
              {paymentForm.partyType === "customer"
                ? customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                : suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
            </Select>
          </Field>
          <Field label={t("label.amount")} required>
            <NumberInput
              value={paymentForm.amount}
              onChange={(e) =>
                setPaymentForm({ ...paymentForm, amount: e.target.valueAsNumber || 0 })
              }
            />
          </Field>
          <Field label={t("label.currency")} required>
            <Select
              value={paymentForm.currency}
              onChange={(e) => handlePaymentCurrencyChange(e.target.value as CurrencyCode)}
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("label.fxRate")} required>
            <NumberInput
              value={paymentForm.fxRate}
              onChange={(e) =>
                setPaymentForm({ ...paymentForm, fxRate: e.target.valueAsNumber || 1 })
              }
            />
          </Field>
          <Field label={t("label.method")} required>
            <Select
              value={paymentForm.method}
              onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
            >
              <option value="">—</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`method.${m}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("label.reference")}>
            <Input
              value={paymentForm.reference}
              onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
            />
          </Field>
          <Field label={t("label.notes")} className="sm:col-span-2">
            <Textarea
              value={paymentForm.note}
              onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })}
              rows={3}
            />
          </Field>
        </div>
      </Modal>

      {/* Expense Modal */}
      <Modal
        open={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        title={editingExpense ? t("action.edit") : t("page.accounting.newExpense")}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setExpenseModalOpen(false)}
              disabled={pending}
            >
              {t("action.cancel")}
            </Button>
            {editingExpense && (
              <Button
                variant="danger"
                onClick={() => setDeleteExpenseConfirm(editingExpense)}
                disabled={pending}
              >
                {t("action.delete")}
              </Button>
            )}
            <Button variant="primary" onClick={submitExpense} disabled={pending}>
              {t("action.save")}
            </Button>
          </>
        }
      >
        {expenseError && (
          <div className="mb-3 p-2 bg-danger-soft text-danger rounded-sm text-2xs">
            {expenseError}
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t("label.date")} required>
            <Input
              type="date"
              value={expenseForm.date}
              onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
              dir="ltr"
            />
          </Field>
          <Field label={t("label.category")} required>
            <Select
              value={expenseForm.category}
              onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
            >
              <option value="">—</option>
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {t(`expense.${cat}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("label.description")} required className="sm:col-span-2">
            <Textarea
              value={expenseForm.description}
              onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
              rows={2}
            />
          </Field>
          <Field label={t("label.amount")} required>
            <NumberInput
              value={expenseForm.amount}
              onChange={(e) =>
                setExpenseForm({ ...expenseForm, amount: e.target.valueAsNumber || 0 })
              }
            />
          </Field>
          <Field label={t("label.currency")} required>
            <Select
              value={expenseForm.currency}
              onChange={(e) => handleExpenseCurrencyChange(e.target.value as CurrencyCode)}
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("label.fxRate")} required>
            <NumberInput
              value={expenseForm.fxRate}
              onChange={(e) =>
                setExpenseForm({ ...expenseForm, fxRate: e.target.valueAsNumber || 1 })
              }
            />
          </Field>
          <Field label={t("label.method")} required>
            <Select
              value={expenseForm.method}
              onChange={(e) => setExpenseForm({ ...expenseForm, method: e.target.value })}
            >
              <option value="">—</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`method.${m}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      {/* Delete Payment Confirm */}
      <Confirm
        open={deletePaymentConfirm !== null}
        onClose={() => setDeletePaymentConfirm(null)}
        onConfirm={submitDeletePayment}
        title={t("action.delete")}
        message={t("msg.confirmDelete")}
        confirmLabel={t("action.delete")}
        tone="danger"
        pending={pending}
      />

      {/* Delete Expense Confirm */}
      <Confirm
        open={deleteExpenseConfirm !== null}
        onClose={() => setDeleteExpenseConfirm(null)}
        onConfirm={submitDeleteExpense}
        title={t("action.delete")}
        message={t("msg.confirmDelete")}
        confirmLabel={t("action.delete")}
        tone="danger"
        pending={pending}
      />
    </>
  );
}
