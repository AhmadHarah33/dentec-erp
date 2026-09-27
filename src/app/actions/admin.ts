"use server";

import { deny, getSessionUser } from "@/lib/session";
import { ROLES } from "@/lib/labels";
import { isSupabaseEnabled } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { create, remove, resetDb, saveSettings, snapshot, update } from "@/lib/data/repository";
import type { Settings, User } from "@/lib/data/types";
import { fail, ok, type Result } from "./shared";

type UserInput = Pick<User, "name" | "email" | "phone" | "role" | "active">;

export interface SavedUser {
  id: string;
  /** Present once, when an account was created: the owner hands it over. */
  tempPassword?: string;
}

const ROLE_SET: ReadonlySet<string> = new Set(ROLES);

/** 12 characters without look-alikes (0/O, 1/l/I), so it survives being read aloud. */
function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** Postgres raises this from `profiles_guard` — the database's own last-owner check. */
function isLastOwner(err: unknown): boolean {
  return err instanceof Error && err.message.includes("dentec_last_owner");
}

export async function saveUser(id: string | null, input: UserInput): Promise<Result<SavedUser>> {
  const denied = await deny("users.manage");
  if (denied) return denied;
  if (!input.name.trim()) return fail("msg.requiredField");
  if (!ROLE_SET.has(input.role)) return fail("msg.error", "role");

  const email = input.email.trim().toLowerCase();
  const clean: UserInput = { ...input, name: input.name.trim(), email, phone: input.phone.trim() };

  const db = await snapshot();
  if (email && db.users.some((u) => u.email.toLowerCase() === email && u.id !== id)) {
    return fail("users.emailTaken");
  }

  const me = await getSessionUser();
  const existing = id ? db.users.find((u) => u.id === id) : undefined;
  if (id && !existing) return fail("msg.error", "not-found");

  // Nobody locks themselves out: your own role and access are changed by
  // another owner, never from your own session.
  if (existing && me && existing.id === me.id && (clean.role !== existing.role || !clean.active)) {
    return fail("users.notSelf");
  }
  const activeOwners = db.users.filter((u) => u.role === "owner" && u.active);
  if (
    existing?.role === "owner" &&
    existing.active &&
    (clean.role !== "owner" || !clean.active) &&
    activeOwners.length <= 1
  ) {
    return fail("users.lastOwner");
  }

  if (!isSupabaseEnabled()) {
    const row = id ? await update("users", id, clean) : await create("users", clean);
    revalidatePath("/settings/users");
    return ok({ id: row.id });
  }

  const admin = createAdminClient();

  if (!existing) {
    if (!email) return fail("users.emailRequired");
    const tempPassword = temporaryPassword();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name: clean.name },
    });
    if (error || !data.user) {
      return fail(error?.message?.toLowerCase().includes("already") ? "users.emailTaken" : "msg.error", error?.message);
    }
    const now = new Date().toISOString();
    const { error: profileError } = await admin.from("profiles").insert({
      id: data.user.id,
      name: clean.name,
      email,
      phone: clean.phone,
      role: clean.role,
      active: clean.active,
      must_change_password: true,
      created_at: now,
      updated_at: now,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return fail("msg.error", profileError.message);
    }
    if (!clean.active) await admin.auth.admin.updateUserById(data.user.id, { ban_duration: "876000h" });
    revalidatePath("/settings/users");
    return ok({ id: data.user.id, tempPassword });
  }

  if (email && email !== existing.email.toLowerCase()) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { email, email_confirm: true });
    if (error) return fail(error.message.toLowerCase().includes("already") ? "users.emailTaken" : "msg.error", error.message);
  }
  try {
    await update("users", existing.id, clean);
  } catch (err) {
    if (isLastOwner(err)) return fail("users.lastOwner");
    throw err;
  }
  if (clean.active !== existing.active) {
    // A deactivated account cannot sign in at all, not merely see nothing.
    await admin.auth.admin.updateUserById(existing.id, {
      ban_duration: clean.active ? "none" : "876000h",
    });
  }
  revalidatePath("/settings/users");
  return ok({ id: existing.id });
}

export async function deleteUser(id: string): Promise<Result<"deleted" | "archived">> {
  const denied = await deny("users.manage");
  if (denied) return denied;
  const me = await getSessionUser();
  if (me && me.id === id) return fail("users.notSelf");

  const db = await snapshot();
  const target = db.users.find((u) => u.id === id);
  if (!target) return fail("msg.error", "not-found");
  if (target.role === "owner" && target.active && db.users.filter((u) => u.role === "owner" && u.active).length <= 1) {
    return fail("users.lastOwner");
  }

  // With real accounts nothing is ever hard-deleted: the name stays on the
  // jobs and documents it touched, and the login is switched off.
  if (isSupabaseEnabled()) {
    try {
      await update("users", id, { active: false });
    } catch (err) {
      if (isLastOwner(err)) return fail("users.lastOwner");
      throw err;
    }
    await createAdminClient().auth.admin.updateUserById(id, { ban_duration: "876000h" });
    revalidatePath("/settings/users");
    return ok("archived");
  }

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

/** A fresh temporary password, shown once to the owner. The old one stops working now. */
export async function resetUserPassword(id: string): Promise<Result<string>> {
  const denied = await deny("users.manage");
  if (denied) return denied;
  if (!isSupabaseEnabled()) return fail("msg.demoOnly");

  const tempPassword = temporaryPassword();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password: tempPassword });
  if (error) return fail("msg.error", error.message);
  await admin
    .from("profiles")
    .update({ must_change_password: true, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/settings/users");
  return ok(tempPassword);
}

export async function updateSettings(patch: Partial<Settings>): Promise<Result> {
  const denied = await deny("settings.write");
  if (denied) return denied;
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
  const denied = await deny("settings.write");
  if (denied) return denied;
  if (isSupabaseEnabled()) return fail("msg.demoOnly");
  await resetDb();
  revalidatePath("/", "layout");
  return ok(undefined);
}
