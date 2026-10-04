/**
 * Stand-in for src/lib/auth/server.ts when the server actions are exercised
 * outside a request (scripts/check-actions.ts). Real sessions need cookies;
 * here the "signed-in member" is whatever the test sets on globalThis.
 *
 * `guard` applies the REAL permission matrix, so the role checks under test
 * are the production ones.
 */

import { can, type Area, type Level } from "../../src/lib/permissions";

type Member = { user: { id: string; name: string }; role: string; email: string };

const current = (): Member | null => (globalThis as unknown as { __member?: Member }).__member ?? null;

export async function currentMember() {
  return current();
}

export async function guard(area: Area, level: Level) {
  const member = current();
  if (!member) return { ok: false as const, errorKey: "auth.signedOut" };
  if (!can(member.role as never, area, level)) return { ok: false as const, errorKey: "auth.forbidden", detail: area };
  return { ok: true as const, member };
}

export async function endAllSessions() {}
