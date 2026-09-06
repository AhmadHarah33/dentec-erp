"use server";

import { revalidatePath } from "next/cache";
import { create, remove, snapshot, update } from "@/lib/data/repository";
import type { Party } from "@/lib/data/types";
import { fail, ok, type Result } from "./shared";

type PartyInput = Omit<Party, "id" | "createdAt" | "updatedAt">;
type Which = "customers" | "suppliers";

export async function saveParty(
  which: Which,
  id: string | null,
  input: PartyInput,
): Promise<Result<string>> {
  if (!input.name.trim()) return fail("msg.requiredField");

  const db = await snapshot();
  const clash = db[which].find(
    (p) => p.code.trim().toLowerCase() === input.code.trim().toLowerCase() && p.id !== id,
  );
  if (input.code.trim() && clash) return fail("msg.error", "duplicate-code");

  const row = id ? await update(which, id, input) : await create(which, input);
  revalidatePath(`/${which}`);
  revalidatePath("/");
  return ok(row.id);
}

/**
 * A party with history is deactivated rather than deleted — its invoices and
 * payments must keep resolving to a name.
 */
export async function deleteParty(
  which: Which,
  id: string,
): Promise<Result<"deleted" | "archived">> {
  const db = await snapshot();
  const referenced =
    db.payments.some((p) => p.partyId === id) ||
    (which === "customers"
      ? db.salesInvoices.some((i) => i.customerId === id) ||
        db.serviceJobs.some((j) => j.customerId === id)
      : db.purchaseOrders.some((o) => o.supplierId === id));

  if (referenced) {
    await update(which, id, { active: false });
    revalidatePath(`/${which}`);
    return ok("archived");
  }

  await remove(which, id);
  revalidatePath(`/${which}`);
  return ok("deleted");
}
