"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { CurrencyCode } from "@/lib/data/types";
import { blankSettings } from "@/lib/data/defaults";
import { getSessionUser, TOUR_COOKIE_PREFIX } from "@/lib/session";
import { isSupabaseEnabled, supabaseServiceKey } from "@/lib/supabase/config";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { fail, ok, type Result } from "./shared";

const MIN_PASSWORD = 8;

/** Only same-site paths: `?next=https://evil.example` must not become a redirect. */
function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

export async function signIn(email: string, password: string, next?: string): Promise<Result<string>> {
  if (!isSupabaseEnabled()) return ok("/");
  if (!email.trim() || !password) return fail("msg.requiredField");

  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error || !data.user) {
    // A wrong password is a 400; anything else means the server is unwell.
    return fail(error && error.status && error.status >= 500 ? "auth.unavailable" : "auth.invalid");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile?.active) {
    await supabase.auth.signOut();
    return fail("auth.inactive");
  }

  return ok(safeNext(next));
}

export async function signOut(): Promise<void> {
  if (isSupabaseEnabled()) {
    const supabase = await createUserClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

export async function changePassword(password: string, confirm: string): Promise<Result> {
  if (!isSupabaseEnabled()) return fail("msg.demoOnly");
  if (password.length < MIN_PASSWORD) return fail("auth.passwordShort");
  if (password !== confirm) return fail("auth.passwordMismatch");

  const user = await getSessionUser();
  if (!user) return fail("msg.signedOut");

  const supabase = await createUserClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return fail("msg.error", error.message);

  await supabase
    .from("profiles")
    .update({ must_change_password: false, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  revalidatePath("/", "layout");
  return ok(undefined);
}

/** The walkthrough was finished or skipped. It stays reachable from the account menu. */
export async function completeTour(): Promise<Result> {
  const user = await getSessionUser();
  if (!user) return fail("msg.signedOut");

  if (user.demo) {
    const store = await cookies();
    store.set(TOUR_COOKIE_PREFIX + user.role, "1", {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    return ok(undefined);
  }

  const supabase = await createUserClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("profiles")
    .update({ tour_completed_at: now, updated_at: now })
    .eq("id", user.id);
  if (error) return fail("msg.error", error.message);
  return ok(undefined);
}

/* ------------------------------------------------------------------ */
/* First-run setup                                                     */
/* ------------------------------------------------------------------ */

export interface SetupInput {
  companyName: string;
  baseCurrency: CurrencyCode;
  defaultTaxRate: number;
  warehouseName: string;
  ownerName: string;
  email: string;
  password: string;
}

export type SetupState = "ready" | "done" | "no-service-key" | "no-schema";

/** Whether /setup should show its form. Uses the service role; reveals only a state. */
export async function setupState(): Promise<SetupState> {
  if (!isSupabaseEnabled()) return "done";
  if (!supabaseServiceKey()) return "no-service-key";
  const admin = createAdminClient();
  const { data, error } = await admin.from("app_meta").select("setup_done").eq("id", 1).maybeSingle();
  if (error || !data) return "no-schema";
  return data.setup_done ? "done" : "ready";
}

/**
 * Creates the company settings, the main warehouse and the first owner, then
 * signs that owner in. Runs once: the claim on `app_meta.setup_done` is a
 * single conditional update, so two people opening /setup at the same moment
 * cannot both become the owner.
 */
export async function runSetup(input: SetupInput): Promise<Result> {
  const state = await setupState();
  if (state === "done") return fail("setup.alreadyDone");
  if (state === "no-service-key") return fail("setup.missingServiceKey");
  if (state === "no-schema") return fail("setup.schemaMissing");

  const email = input.email.trim().toLowerCase();
  if (!input.companyName.trim() || !input.ownerName.trim() || !email) return fail("msg.requiredField");
  if (input.password.length < MIN_PASSWORD) return fail("auth.passwordShort");

  const admin = createAdminClient();

  const { data: claimed } = await admin
    .from("app_meta")
    .update({ setup_done: true })
    .eq("id", 1)
    .eq("setup_done", false)
    .select("id");
  if (!claimed?.length) return fail("setup.alreadyDone");

  const release = () => admin.from("app_meta").update({ setup_done: false }).eq("id", 1);

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.ownerName.trim() },
  });
  if (authError || !created.user) {
    await release();
    return fail("msg.error", authError?.message);
  }

  const now = new Date().toISOString();
  const settings = {
    ...blankSettings(),
    companyName: input.companyName.trim(),
    baseCurrency: input.baseCurrency,
    currencies: [{ code: input.baseCurrency, rate: 1 }],
    defaultTaxRate: Number.isFinite(input.defaultTaxRate) ? input.defaultTaxRate : 0,
    email,
  };
  const { updatedAt: _unused, ...settingsData } = settings;

  const writes = await Promise.all([
    admin.from("profiles").insert({
      id: created.user.id,
      name: input.ownerName.trim(),
      email,
      role: "owner",
      active: true,
      must_change_password: false,
      created_at: now,
      updated_at: now,
    }),
    admin.from("app_settings").update({ data: settingsData, updated_at: now }).eq("id", 1),
    admin.from("warehouses").insert({
      name_ar: input.warehouseName.trim() || "المستودع الرئيسي",
      name_tr: "",
      location: "",
      is_default: true,
      active: true,
      created_at: now,
      updated_at: now,
    }),
  ]);
  const failed = writes.find((w) => w.error);
  if (failed) {
    await admin.auth.admin.deleteUser(created.user.id);
    await release();
    return fail("msg.error", failed.error?.message);
  }

  const supabase = await createUserClient();
  await supabase.auth.signInWithPassword({ email, password: input.password });
  return ok(undefined);
}
