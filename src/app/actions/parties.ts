"use server";

import { revalidatePath } from "next/cache";
import { create, remove, snapshot, update } from "@/lib/data/repository";
import type { Party } from "@/lib/data/types";
import { guard } from "@/lib/auth/server";
import { partyInput } from "@/lib/inputs";
import { parse } from "@/lib/validate";
import { attempt, fail, ok, type Result } from "./shared";

type PartyInput = Omit<Party, "id" | "createdAt" | "updatedAt">;
type Which = "customers" | "suppliers";

async function savePartyImpl(
  which: Which,
  id: string | null,
  input: PartyInput,
): Promise<Result<string>> {
  // Customers and suppliers sit in different areas of the permission table.
  const gate = await guard(which === "customers" ? "customers" : "purchasing", "edit");
  if (!gate.ok) return gate;
  const parsed = parse(() => partyInput(input));
  if (!parsed.ok) return parsed;
  const data = parsed.data;
  if (!data.name.trim()) return fail("msg.requiredField");

  const db = await snapshot();
  const clash = db[which].find(
    (p) => p.code.trim().toLowerCase() === data.code.trim().toLowerCase() && p.id !== id,
  );
  if (data.code.trim() && clash) return fail("msg.error", "duplicate-code");
  if (id && !db[which].some((p) => p.id === id)) return fail("msg.error", "not-found");

  const row = id ? await update(which, id, data) : await create(which, data);
  revalidatePath(`/${which}`);
  revalidatePath("/");
  return ok(row.id);
}

/**
 * A party with history is deactivated rather than deleted — its invoices and
 * payments must keep resolving to a name.
 */
async function deletePartyImpl(
  which: Which,
  id: string,
): Promise<Result<"deleted" | "archived">> {
  // Customers and suppliers sit in different areas of the permission table.
  const gate = await guard(which === "customers" ? "customers" : "purchasing", "edit");
  if (!gate.ok) return gate;
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

/* ------------------------------------------------------------------ */
/* Public actions. Each runs its implementation inside `attempt`, so an   */
/* unexpected failure is returned as a Result rather than thrown.        */
/* ------------------------------------------------------------------ */

export async function saveParty(...args: Parameters<typeof savePartyImpl>): ReturnType<typeof savePartyImpl> {
  return attempt(() => savePartyImpl(...args));
}

export async function deleteParty(...args: Parameters<typeof deletePartyImpl>): ReturnType<typeof deletePartyImpl> {
  return attempt(() => deletePartyImpl(...args));
}
