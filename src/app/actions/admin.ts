"use server";

import { revalidatePath } from "next/cache";
import { create, remove, saveSettings, snapshot, update } from "@/lib/data/repository";
import type { Database, Role, Settings } from "@/lib/data/types";
import { endAllSessions, guard } from "@/lib/auth/server";
import { emailAccountLink, issueToken } from "@/lib/auth/links";
import { database } from "@/lib/data/store";
import { mailEnabled } from "@/lib/mail";
import { settingsPatch, userInput } from "@/lib/inputs";
import { parse } from "@/lib/validate";
import { attempt, fail, ok, type Result } from "./shared";

/** What the users form may set. Passwords and links are managed by the account actions, not the form. */
interface UserInput {
  name: string;
  email: string;
  phone: string;
  role: Role;
  active: boolean;
}

const normEmail = (e: string) => e.trim().toLowerCase();

/**
 * Would this change leave the ERP with no active owner? Someone has to be
 * able to manage users, or the only way back in is the database.
 */
function leavesNoOwner(db: Database, id: string, next: { role: Role; active: boolean } | null): boolean {
  const owners = db.users.filter((u) => u.active && u.role === "owner");
  const target = db.users.find((u) => u.id === id);
  if (!target || !target.active || target.role !== "owner") return false;
  const stillOwner = next !== null && next.active && next.role === "owner";
  return !stillOwner && owners.length <= 1;
}

async function saveUserImpl(id: string | null, input: UserInput): Promise<Result<string>> {
  const gate = await guard("settings", "edit");
  if (!gate.ok) return gate;
  const parsed = parse(() => userInput(input));
  if (!parsed.ok) return parsed;
  input = parsed.data;
  if (!input.name.trim()) return fail("msg.requiredField");

  const email = normEmail(input.email);
  const db = await snapshot();
  if (email && db.users.some((u) => normEmail(u.email) === email && u.id !== id)) {
    return fail("msg.error", "duplicate-email");
  }

  if (id) {
    const existing = db.users.find((u) => u.id === id);
    if (!existing) return fail("msg.error", "not-found");
    // Locking yourself out from your own screen helps nobody.
    if (id === gate.member.user.id && (input.role !== existing.role || !input.active)) {
      return fail("users.notSelf");
    }
    if (leavesNoOwner(db, id, input)) return fail("users.lastOwner");

    // Deactivating someone ends their sessions now, not at their next request.
    if (!input.active && existing.active) await endAllSessions(id);
    const row = await update("users", id, { ...input, email });
    revalidatePath("/settings/users");
    return ok(row.id);
  }

  const row = await create("users", { ...input, email });
  revalidatePath("/settings/users");
  return ok(row.id);
}

/**
 * Remove a person. Anyone with history — a login, or a name on service jobs —
 * is archived instead: deactivated, kept for the records, signed out.
 */
async function deleteUserImpl(id: string): Promise<Result<"deleted" | "archived">> {
  const gate = await guard("settings", "edit");
  if (!gate.ok) return gate;
  if (id === gate.member.user.id) return fail("users.notSelf");

  const db = await snapshot();
  const user = db.users.find((u) => u.id === id);
  if (!user) return fail("msg.error", "not-found");
  if (leavesNoOwner(db, id, null)) return fail("users.lastOwner");

  const [cred] = await database()`select 1 as x from erp.credentials where user_id = ${id}`;
  if (cred || db.serviceJobs.some((j) => j.technicianId === id)) {
    await update("users", id, { active: false });
    await endAllSessions(id);
    revalidatePath("/settings/users");
    return ok("archived");
  }
  await remove("users", id);
  revalidatePath("/settings/users");
  return ok("deleted");
}

/**
 * Issue a one-time link: an invitation (first password) or a reset. The
 * link is always returned so the owner can send it by hand; when mail is
 * configured it is also emailed.
 */
async function issueAccountLinkImpl(
  id: string,
  kind: "invite" | "recovery",
): Promise<Result<{ url: string; mailedTo: string | null }>> {
  const gate = await guard("settings", "edit");
  if (!gate.ok) return gate;

  const db = await snapshot();
  const user = db.users.find((u) => u.id === id);
  if (!user) return fail("msg.error", "not-found");
  if (!user.active) return fail("msg.error", "inactive");
  const email = normEmail(user.email);
  if (!email) return fail("users.emailRequired");

  const link = await issueToken(id, kind);

  let mailedTo: string | null = null;
  if (mailEnabled()) {
    try {
      await emailAccountLink(email, link.type, link.url);
      mailedTo = email;
    } catch (err) {
      // The link still works; the owner shares it by hand.
      console.error("[mail] account link not sent:", err instanceof Error ? err.message : err);
    }
  }

  revalidatePath("/settings/users");
  return ok({ url: link.url, mailedTo });
}

async function updateSettingsImpl(patch: Partial<Settings>): Promise<Result> {
  const gate = await guard("settings", "edit");
  if (!gate.ok) return gate;
  const parsed = parse(() => settingsPatch(patch));
  if (!parsed.ok) return parsed;
  const clean = parsed.data;
  if (clean.companyName !== undefined && !clean.companyName.trim()) {
    return fail("msg.requiredField");
  }
  await saveSettings(clean);
  // Currency, tax rate and company details appear on nearly every screen.
  revalidatePath("/", "layout");
  return ok(undefined);
}

/* ------------------------------------------------------------------ */
/* Public actions. Each runs its implementation inside `attempt`, so an   */
/* unexpected failure is returned as a Result rather than thrown.        */
/* ------------------------------------------------------------------ */

export async function saveUser(...args: Parameters<typeof saveUserImpl>): ReturnType<typeof saveUserImpl> {
  return attempt(() => saveUserImpl(...args));
}

export async function deleteUser(...args: Parameters<typeof deleteUserImpl>): ReturnType<typeof deleteUserImpl> {
  return attempt(() => deleteUserImpl(...args));
}

export async function issueAccountLink(...args: Parameters<typeof issueAccountLinkImpl>): ReturnType<typeof issueAccountLinkImpl> {
  return attempt(() => issueAccountLinkImpl(...args));
}

export async function updateSettings(...args: Parameters<typeof updateSettingsImpl>): ReturnType<typeof updateSettingsImpl> {
  return attempt(() => updateSettingsImpl(...args));
}
