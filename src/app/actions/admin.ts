"use server";

import { revalidatePath } from "next/cache";
import { create, remove, resetDb, saveSettings, snapshot, update } from "@/lib/data/repository";
import type { Settings, User } from "@/lib/data/types";
import { fail, ok, type Result } from "./shared";

type UserInput = Omit<User, "id" | "createdAt" | "updatedAt">;

export async function saveUser(id: string | null, input: UserInput): Promise<Result<string>> {
  if (!input.name.trim()) return fail("msg.requiredField");

  const db = await snapshot();
  if (
    input.email.trim() &&
    db.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase() && u.id !== id)
  ) {
    return fail("msg.error", "duplicate-email");
  }

  const row = id ? await update("users", id, input) : await create("users", input);
  revalidatePath("/settings/users");
  return ok(row.id);
}

export async function deleteUser(id: string): Promise<Result<"deleted" | "archived">> {
  const db = await snapshot();
  // Technicians are named on service jobs; keep the name resolvable.
  if (db.serviceJobs.some((j) => j.technicianId === id)) {
    await update("users", id, { active: false });
    revalidatePath("/settings/users");
    return ok("archived");
  }
  await remove("users", id);
  revalidatePath("/settings/users");
  return ok("deleted");
}

export async function updateSettings(patch: Partial<Settings>): Promise<Result> {
  if (patch.companyName !== undefined && !patch.companyName.trim()) {
    return fail("msg.requiredField");
  }
  await saveSettings(patch);
  // Currency, tax rate and company details appear on nearly every screen.
  revalidatePath("/", "layout");
  return ok(undefined);
}

/** Throw the data away and lay the demo set down again. */
export async function resetDemoData(): Promise<Result> {
  await resetDb();
  revalidatePath("/", "layout");
  return ok(undefined);
}
