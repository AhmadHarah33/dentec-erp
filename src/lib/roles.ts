import type { MessageKey } from "./i18n";

/**
 * Which of the three jobs the person in front of the screen is doing.
 *
 * This is a VIEW PREFERENCE, not security. It decides what the dashboard
 * leads with and nothing else: no page is hidden, no action is blocked, no
 * figure is withheld. Real permissions arrive with Supabase accounts; until
 * then the app has no idea who anyone is and must not pretend otherwise.
 *
 * Stored in a cookie exactly like the locale, so it survives a reload and is
 * per-device — the workshop machine can sit on "service" while the office one
 * sits on "owner".
 */
export type ViewRole = "owner" | "accounting" | "service";

export const VIEW_ROLES: ViewRole[] = ["owner", "accounting", "service"];
export const ROLE_COOKIE = "dentec_role";
export const DEFAULT_ROLE: ViewRole = "owner";

export function isViewRole(v: unknown): v is ViewRole {
  return v === "owner" || v === "accounting" || v === "service";
}

export function viewRoleKey(role: ViewRole): MessageKey {
  return `viewRole.${role}` as MessageKey;
}
