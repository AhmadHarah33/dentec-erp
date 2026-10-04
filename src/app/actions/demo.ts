"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DEMO, DEMO_ROLE_COOKIE, DEMO_ROLES } from "@/lib/demo";
import { fail, ok, type Result } from "./shared";

/**
 * Demo mode only: choose which role to browse as. It sets a cookie that
 * `currentMember()` reads; it grants nothing the permission table does not
 * already give that role. On the real server DEMO is false and this refuses.
 */
export async function switchDemoRole(role: string): Promise<Result> {
  if (!DEMO) return fail("auth.forbidden");
  if (typeof role !== "string" || !(DEMO_ROLES as readonly string[]).includes(role)) return fail("msg.error", "invalid:role");
  const store = await cookies();
  store.set(DEMO_ROLE_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 24 * 60 * 60,
  });
  revalidatePath("/", "layout");
  return ok(undefined);
}
