"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { snapshot } from "@/lib/data/repository";
import { checkPassword, endSession, setPassword, startSession } from "@/lib/auth/server";
import { mailEnabled } from "@/lib/mail";
import { appOrigin, consumeToken, emailAccountLink, issueToken, MIN_PASSWORD, voidTokens } from "@/lib/auth/links";
import { MAX_PASSWORD } from "@/lib/auth/crypto";
import { clientIp, hit, keyPart } from "@/lib/auth/limits";
import { getI18n } from "@/lib/i18n/server";
import { fail, ok, type Result } from "./shared";

/** Only same-site paths survive a `?next=`; anything else could bounce a user off-site. */
function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signIn(email: string, password: string, next?: string): Promise<Result<string>> {
  // Types are erased at the boundary; a non-string would throw below.
  if (typeof email !== "string" || typeof password !== "string") return fail("auth.invalid");
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
  if (typeof password !== "string" || typeof token !== "string") return fail("auth.linkInvalid");
  if (password.length < MIN_PASSWORD) return fail("auth.passwordShort");
  if (password.length > MAX_PASSWORD) return fail("auth.passwordLong");
  if (!token) return fail("auth.linkInvalid");

  const userId = await consumeToken(type, token);
  if (!userId) return fail("auth.linkInvalid");

  const db = await snapshot();
  const user = db.users.find((u) => u.id === userId);
  if (!user || !user.active) return fail("auth.notMember");

  await setPassword(userId, password);
  // This link is spent; so is every other one still outstanding for the account.
  await voidTokens(userId);
  await startSession(userId);
  return ok("/");
}

/**
 * "Forgot password". Answers the same way, and in the same time, whether or
 * not the email belongs to anyone: the work (looking the person up, minting
 * the link, sending the mail) happens after the response has gone, so the
 * response time says nothing. Without mail configured there is no safe
 * self-service path: the owner issues the link.
 *
 * Limited per address and per client, silently — a refusal would say which
 * addresses are being asked about. Without a limit this is a way to fill
 * someone's inbox.
 */
export async function requestReset(email: string): Promise<Result<"sent">> {
  if (!mailEnabled()) return fail("auth.noMailer");
  if (typeof email !== "string") return fail("msg.requiredField");
  const address = email.trim().toLowerCase().slice(0, 200);
  if (!address) return fail("msg.requiredField");

  const ip = await clientIp();
  const [addressAllowed, clientAllowed] = await Promise.all([
    hit(`reset:mail:${keyPart(address)}`, 3, 60 * 60),
    hit(`reset:ip:${keyPart(ip)}`, 10, 60 * 60),
  ]);
  if (!addressAllowed || !clientAllowed) return ok("sent");

  // Request-scoped things are read now; the callback below runs after the response.
  const origin = await appOrigin();
  const i18n = await getI18n();
  after(async () => {
    try {
      const db = await snapshot();
      const member = db.users.find((u) => u.active && u.email.trim().toLowerCase() === address);
      if (!member) return;
      // Does not void the person's other links: see issueToken.
      const link = await issueToken(member.id, "recovery", { supersede: false, origin });
      await emailAccountLink(address, "recovery", link.url, i18n);
    } catch (err) {
      console.error("[auth] reset request failed:", err instanceof Error ? err.message : err);
    }
  });
  return ok("sent");
}
