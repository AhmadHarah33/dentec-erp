"use server";

import { revalidatePath } from "next/cache";
import { create, remove, snapshot, update } from "@/lib/data/repository";
import type { Expense, Payment } from "@/lib/data/types";
import { round2 } from "@/lib/money";
import { guard } from "@/lib/auth/server";
import { expenseInput, paymentInput } from "@/lib/inputs";
import { parse } from "@/lib/validate";
import { fail, ok, type Result } from "./shared";
import { syncStatus } from "@/lib/invoice-status";

type PaymentInput = Omit<Payment, "id" | "createdAt" | "updatedAt">;
type ExpenseInput = Omit<Expense, "id" | "createdAt" | "updatedAt">;

function refresh() {
  for (const p of ["/", "/accounting", "/customers", "/suppliers", "/invoices", "/reports"]) {
    revalidatePath(p);
  }
}

export async function savePayment(
  id: string | null,
  input: PaymentInput,
): Promise<Result<string>> {
  const gate = await guard("finance", "edit");
  if (!gate.ok) return gate;
  const parsed = parse(() => paymentInput(input));
  if (!parsed.ok) return parsed;
  const data = parsed.data;
  if (!data.partyId) return fail("msg.requiredField");
  if (data.amount <= 0) return fail("msg.requiredField");

  const db = await snapshot();
  const parties = data.partyType === "customer" ? db.customers : db.suppliers;
  if (!parties.some((p) => p.id === data.partyId)) return fail("msg.error", "unknown-reference");
  if (data.invoiceId && !db.salesInvoices.some((i) => i.id === data.invoiceId)) {
    return fail("msg.error", "unknown-reference");
  }
  if (id && !db.payments.some((p) => p.id === id)) return fail("msg.error", "not-found");

  const clean = { ...data, amount: round2(data.amount) };
  const row = id ? await update("payments", id, clean) : await create("payments", clean);

  // A payment against an invoice changes whether that invoice is settled.
  if (row.invoiceId) await syncStatus(row.invoiceId);
  refresh();
  return ok(row.id);
}

export async function deletePayment(id: string, invoiceId: string | null): Promise<Result> {
  const gate = await guard("finance", "edit");
  if (!gate.ok) return gate;
  await remove("payments", id);
  if (invoiceId) await syncStatus(invoiceId);
  refresh();
  return ok(undefined);
}

export async function saveExpense(
  id: string | null,
  input: ExpenseInput,
): Promise<Result<string>> {
  const gate = await guard("finance", "edit");
  if (!gate.ok) return gate;
  const parsed = parse(() => expenseInput(input));
  if (!parsed.ok) return parsed;
  const data = parsed.data;
  if (data.amount <= 0) return fail("msg.requiredField");
  if (!data.description.trim()) return fail("msg.requiredField");
  if (id && !(await snapshot()).expenses.some((e) => e.id === id)) return fail("msg.error", "not-found");

  const clean = { ...data, amount: round2(data.amount) };
  const row = id ? await update("expenses", id, clean) : await create("expenses", clean);
  refresh();
  return ok(row.id);
}

export async function deleteExpense(id: string): Promise<Result> {
  const gate = await guard("finance", "edit");
  if (!gate.ok) return gate;
  await remove("expenses", id);
  refresh();
  return ok(undefined);
}
