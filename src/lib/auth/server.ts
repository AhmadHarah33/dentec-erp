/**
 * Server-side authentication. NEVER import this from a client component.
 *
 * The ERP authenticates its own users. Supabase Auth was the first plan, but
 * that Supabase instance is shared with another project whose tables admit
 * any authenticated Supabase user — an ERP employee with a Supabase account
 * could have read or deleted that project's data. Accounts here never leave
 * the erp schema (credentials, sessions and auth_tokens; migration 0002).
 *
 * Sessions are random 32-byte tokens in an httpOnly cookie; the database
 * stores only their SHA-256, so a copy of the table cannot be replayed.
 * Server actions carry Next's built-in same-origin check, which is what
 * stands in for a CSRF token.
 */

import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { database } from "@/lib/data/store";
import { snapshot } from "@/lib/data/repository";
import type { Role, User } from "@/lib/data/types";
import { can, type Area, type Level } from "@/lib/permissions";
import type { MessageKey } from "@/lib/i18n";
import { SESSION_COOKIE } from "./cookie";
import { dummyPasswordHash, hashPassword, newToken, tokenId, verifyPassword } from "./crypto";

/** A session lasts this long without use; using it pushes the expiry forward. */
const SESSION_DAYS = 14;
/** Write "last seen" at most this often, not on every request. */
const TOUCH_MS = 60 * 60 * 1000;
/** Throttling: this many wrong passwords in a row lock the account for LOCK_MINUTES. */
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

export interface Member {
  user: User;
  role: Role;
  email: string;
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

/** ISO text, cast in SQL: the driver cannot infer a type for a bare Date parameter. */
function expiry(): string {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** Start a session for a user and set its cookie. Server actions and route handlers only. */
export async function startSession(userId: string): Promise<void> {
  const token = newToken();
  const h = await headers();
  const sql = database();
  await sql`
    insert into erp.sessions (id, user_id, expires_at, user_agent)
    values (${tokenId(token)}, ${userId}, ${expiry()}::timestamptz, ${(h.get("user-agent") ?? "").slice(0, 300)})`;
  // Expired sessions are cleared opportunistically, on sign-in rather than
  // by a scheduler.
  await sql`delete from erp.sessions where expires_at < now()`;

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/** End this request's session, in the database and in the browser. */
export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await database()`delete from erp.sessions where id = ${tokenId(token)}`;
  store.delete(SESSION_COOKIE);
}

/** Sign a person out everywhere — after a password reset or a deactivation. */
export async function endAllSessions(userId: string): Promise<void> {
  await database()`delete from erp.sessions where user_id = ${userId}`;
}

/**
 * Who is making this request, as an ERP member — or null. Cached for the
 * request, so the layout, the page and every guard share one lookup.
 */
export const currentMember = cache(async (): Promise<Member | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const sql = database();
  const id = tokenId(token);
  const [session] = await sql`
    select user_id, expires_at, last_seen_at from erp.sessions where id = ${id}`;
  if (!session || new Date(session.expires_at as string) < new Date()) return null;

  const db = await snapshot();
  const user = db.users.find((u) => u.id === session.user_id);
  // Deactivating someone ends their access on their very next request.
  if (!user || !user.active) return null;

  if (Date.now() - new Date(session.last_seen_at as string).getTime() > TOUCH_MS) {
    await sql`update erp.sessions set last_seen_at = now(), expires_at = ${expiry()}::timestamptz where id = ${id}`;
  }
  return { user, role: user.role, email: user.email };
});

/* ------------------------------------------------------------------ */
/* Passwords                                                           */
/* ------------------------------------------------------------------ */

export type SignInFailure = "invalid" | "locked";

/**
 * Check an email and password. Wrong email and wrong password take the same
 * time and give the same answer, so the form cannot be used to find out who
 * has an account.
 */
export async function checkPassword(
  email: string,
  password: string,
): Promise<{ ok: true; user: User } | { ok: false; reason: SignInFailure }> {
  const address = email.trim().toLowerCase();
  const db = await snapshot();
  const user = db.users.find((u) => u.active && u.email.trim().toLowerCase() === address);
  const sql = database();
  const [cred] = user
    ? await sql`select password_hash, failed_attempts, locked_until from erp.credentials where user_id = ${user.id}`
    : [];

  if (!user || !cred) {
    await verifyPassword(password, await dummyPasswordHash());
    return { ok: false, reason: "invalid" };
  }
  if (cred.locked_until && new Date(cred.locked_until as string) > new Date()) {
    return { ok: false, reason: "locked" };
  }

  if (!(await verifyPassword(password, cred.password_hash as string))) {
    const failures = (cred.failed_attempts as number) + 1;
    const lock = failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString() : null;
    await sql`
      update erp.credentials
      set failed_attempts = ${lock ? 0 : failures}, locked_until = ${lock}::timestamptz
      where user_id = ${user.id}`;
    return { ok: false, reason: lock ? "locked" : "invalid" };
  }

  await sql`
    update erp.credentials
    set failed_attempts = 0, locked_until = null, last_sign_in_at = now()
    where user_id = ${user.id}`;
  return { ok: true, user };
}

/** Set (or replace) a person's password. Ends their other sessions. */
export async function setPassword(userId: string, password: string): Promise<void> {
  const hash = await hashPassword(password);
  const sql = database();
  await sql`
    insert into erp.credentials (user_id, password_hash)
    values (${userId}, ${hash})
    on conflict (user_id) do update
      set password_hash = excluded.password_hash, password_set_at = now(),
          failed_attempts = 0, locked_until = null`;
  await endAllSessions(userId);
}

export interface AccountState {
  hasPassword: boolean;
  lastSignIn: string | null;
  pendingInvite: boolean;
}

/** For the users page: who has a password, who last signed in, who has an invitation outstanding. */
export async function accountStates(): Promise<Map<string, AccountState>> {
  const sql = database();
  const creds = await sql`select user_id, last_sign_in_at from erp.credentials`;
  const invites = await sql`
    select distinct user_id from erp.auth_tokens
    where kind = 'invite' and used_at is null and expires_at > now()`;
  const out = new Map<string, AccountState>();
  for (const c of creds) {
    out.set(c.user_id as string, {
      hasPassword: true,
      lastSignIn: (c.last_sign_in_at as string | null) ?? null,
      pendingInvite: false,
    });
  }
  for (const i of invites) {
    const entry = out.get(i.user_id as string) ?? { hasPassword: false, lastSignIn: null, pendingInvite: false };
    out.set(i.user_id as string, { ...entry, pendingInvite: true });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Guards                                                              */
/* ------------------------------------------------------------------ */

/** For layouts and pages: a member, or off to the login page. */
export async function requireMember(): Promise<Member> {
  const member = await currentMember();
  if (!member) redirect("/login");
  return member;
}

/**
 * For pages: a member with at least `level` on `area`. Anyone else lands on
 * the dashboard, which every member can open — a link to a page you may not
 * see should not end in an error screen.
 */
export async function requireAccess(area: Area, level: Level = "view"): Promise<Member> {
  const member = await requireMember();
  if (!can(member.role, area, level)) redirect("/?denied=" + area);
  return member;
}

/**
 * For server actions, which return a Result rather than redirecting:
 *
 *   const gate = await guard("invoices", "edit");
 *   if (!gate.ok) return gate;
 */
export async function guard(
  area: Area,
  level: Level,
): Promise<{ ok: true; member: Member } | { ok: false; errorKey: MessageKey; detail?: string }> {
  const member = await currentMember();
  if (!member) return { ok: false, errorKey: "auth.signedOut" };
  if (!can(member.role, area, level)) return { ok: false, errorKey: "auth.forbidden", detail: area };
  return { ok: true, member };
}
