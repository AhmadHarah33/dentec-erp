"use server";

import { revalidatePath } from "next/cache";
import { create, remove, update } from "@/lib/data/repository";
import type { Expense, Payment } from "@/lib/data/types";
import { round2 } from "@/lib/money";
import { fail, ok, type Result } from "./shared";
import { syncStatus } from "./sales";

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
  if (!input.partyId) return fail("msg.requiredField");
  if (input.amount <= 0) return fail("msg.requiredField");

  const clean = { ...input, amount: round2(input.amount) };
  const row = id ? await update("payments", id, clean) : await create("payments", clean);

  // A payment against an invoice changes whether that invoice is settled.
  if (row.invoiceId) await syncStatus(row.invoiceId);
  refresh();
  return ok(row.id);
}

export async function deletePayment(id: string, invoiceId: string | null): Promise<Result> {
  await remove("payments", id);
  if (invoiceId) await syncStatus(invoiceId);
  refresh();
  return ok(undefined);
}

export async function saveExpense(
  id: string | null,
  input: ExpenseInput,
): Promise<Result<string>> {
  if (input.amount <= 0) return fail("msg.requiredField");
  if (!input.description.trim()) return fail("msg.requiredField");

  const clean = { ...input, amount: round2(input.amount) };
  const row = id ? await update("expenses", id, clean) : await create("expenses", clean);
  refresh();
  return ok(row.id);
}

export async function deleteExpense(id: string): Promise<Result> {
  await remove("expenses", id);
  refresh();
  return ok(undefined);
}
