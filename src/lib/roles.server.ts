import { cookies } from "next/headers";
import { DEFAULT_ROLE, ROLE_COOKIE, isViewRole, type ViewRole } from "./roles";

/**
 * The active view role for this request. Server components only — kept out of
 * `roles.ts` so client components can import the type and the constants
 * without pulling `next/headers` into the browser bundle.
 */
export async function getViewRole(): Promise<ViewRole> {
  const store = await cookies();
  const value = store.get(ROLE_COOKIE)?.value;
  return isViewRole(value) ? value : DEFAULT_ROLE;
}
