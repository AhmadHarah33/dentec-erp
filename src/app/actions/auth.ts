"use server";

import { redirect } from "next/navigation";
import { snapshot } from "@/lib/data/repository";
import { checkPassword, endSession, setPassword, startSession } from "@/lib/auth/server";
import { mailEnabled } from "@/lib/mail";
import { consumeToken, emailAccountLink, issueToken, MIN_PASSWORD } from "@/lib/auth/links";
import { fail, ok, type Result } from "./shared";

/** Only same-site paths survive a `?next=`; anything else could bounce a user off-site. */
function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signIn(email: string, password: string, next?: string): Promise<Result<string>> {
  if (!email.trim() || !password) return fail("msg.requiredField");
  const result = await checkPassword(email, password);
  // One message for every failure bar the lockout, so the form cannot be used
  // to find out who has an account.
  if (!result.ok) return fail(result.reason === "locked" ? "auth.locked" : "auth.invalid");
  await startSession(result.user.id);
  return ok(safeNext(next));
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/login");
}

/**
 * Finish an invitation or a password reset: spend the one-time token, then
 * set the password the person chose and sign them in.
 *
 * The token is spent here, when the form is submitted, and not when the
 * link is opened — mail scanners open links to check them, and spending on
 * open would burn the token before the person ever saw the page.
 */
export async function acceptLink(
  type: "invite" | "recovery",
  token: string,
  password: string,
): Promise<Result<string>> {
  if (password.length < MIN_PASSWORD) return fail("auth.passwordShort");
  if (!token) return fail("auth.linkInvalid");

  const userId = await consumeToken(type, token);
  if (!userId) return fail("auth.linkInvalid");

  const db = await snapshot();
  const user = db.users.find((u) => u.id === userId);
  if (!user || !user.active) return fail("auth.notMember");

  await setPassword(userId, password);
  await startSession(userId);
  return ok("/");
}

/**
 * "Forgot password". Answers the same way whether or not the email belongs
 * to anyone, so it cannot be used to probe for accounts. Without mail
 * configured there is no safe self-service path: the owner issues the link.
 */
export async function requestReset(email: string): Promise<Result<"sent">> {
  if (!mailEnabled()) return fail("auth.noMailer");
  const address = email.trim().toLowerCase();
  if (!address) return fail("msg.requiredField");

  const db = await snapshot();
  const member = db.users.find((u) => u.active && u.email.trim().toLowerCase() === address);
  if (member) {
    const link = await issueToken(member.id, "recovery");
    await emailAccountLink(address, "recovery", link.url).catch(() => {});
  }
  return ok("sent");
}
