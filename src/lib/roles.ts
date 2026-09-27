import type { MessageKey } from "./i18n";
import type { Role } from "./data/types";

/**
 * Which of the three jobs the person in front of the screen is doing.
 *
 * With Supabase connected this is the signed-in user's role, read from their
 * profile — the cookie below is ignored. In demo mode (no Supabase env vars)
 * there is nobody to sign in, so the cookie picks which role the demo acts as;
 * that makes every role's navigation, guards and walkthrough testable without
 * a server. The cookie is never trusted when Supabase is on.
 */
export type ViewRole = Role;

export const VIEW_ROLES: ViewRole[] = ["owner", "accounting", "service"];
export const ROLE_COOKIE = "dentec_role";
export const DEFAULT_ROLE: ViewRole = "owner";

export function isViewRole(v: unknown): v is ViewRole {
  return v === "owner" || v === "accounting" || v === "service";
}

export function viewRoleKey(role: ViewRole): MessageKey {
  return `viewRole.${role}` as MessageKey;
}
