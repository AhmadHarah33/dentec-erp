import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "./data/types";
import { can, canAccess, type Capability, type Section } from "./permissions";
import { getViewRole } from "./roles.server";
import { isSupabaseEnabled } from "./supabase/config";
import { createUserClient } from "./supabase/server";

/**
 * The person using the app, for this request. Server components and server
 * actions only.
 *
 * With Supabase this is the signed-in account and its profile. Without it the
 * app is a single-machine demo: there is no one to sign in, so a synthetic
 * user acts in whichever role the demo role cookie names.
 */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** True in demo mode — no Supabase, no sign-in, role picked from a menu. */
  demo: boolean;
  mustChangePassword: boolean;
  /** Whether the first-login walkthrough still needs to be shown. */
  tourPending: boolean;
}

/** Demo mode remembers a finished walkthrough per role, so each can be tried. */
export const TOUR_COOKIE_PREFIX = "dentec_tour_";

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!isSupabaseEnabled()) {
    const role = await getViewRole();
    const store = await cookies();
    return {
      id: "demo",
      name: "",
      email: "",
      role,
      demo: true,
      mustChangePassword: false,
      tourPending: !store.get(TOUR_COOKIE_PREFIX + role),
    };
  }

  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, email, role, active, must_change_password, tour_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  // An account without an active profile — deactivated, or created outside
  // the app — is treated as signed out. RLS already shows it nothing.
  if (!profile || !profile.active) return null;

  return {
    id: profile.id,
    name: profile.name || user.email || "",
    email: profile.email || user.email || "",
    role: profile.role as Role,
    demo: false,
    mustChangePassword: Boolean(profile.must_change_password),
    tourPending: !profile.tour_completed_at,
  };
});

/** For pages: the user, or a redirect to sign-in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * For pages in a restricted section. A person who follows a stale link to a
 * page their role cannot open lands on the dashboard with a notice, rather
 * than on a page of empty tables (RLS would have emptied them anyway).
 */
export async function requireSection(section: Section): Promise<SessionUser> {
  const user = await requireUser();
  if (!canAccess(user.role, section)) redirect("/?denied=1");
  return user;
}

/**
 * For server actions: `null` when allowed, otherwise the `Result` to return.
 *
 *   const denied = await deny("sales.write");
 *   if (denied) return denied;
 */
export async function deny(capability: Capability) {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, errorKey: "msg.signedOut" as const };
  if (!can(user.role, capability)) return { ok: false as const, errorKey: "msg.forbidden" as const };
  return null;
}
