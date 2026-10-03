/**
 * One-time account links (invitations, password resets) and the mail that
 * carries them.
 *
 * Deliberately NOT a "use server" file. Every export of a "use server"
 * module is a public endpoint any browser can call, and `mintAccountLink`
 * hands out a link that sets the password of any account — callable from
 * outside, it would be an account takeover. Here it is plain server code,
 * reachable only from actions that have already checked who is asking.
 */

import "server-only";
import { headers } from "next/headers";
import { database } from "@/lib/data/store";
import { newToken, tokenId } from "./crypto";
import { actionEmail, sendMail } from "@/lib/mail";
import { getI18n } from "@/lib/i18n/server";

/** Long enough to resist guessing; no composition rules, which mostly produce Password1!. */
export const MIN_PASSWORD = 10;

/** Where the ERP answers, for links that leave it in an email or a chat message. */
export async function appOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** The URL says "recovery"; the table says "reset". */
export type LinkType = "invite" | "recovery";
const KIND = { invite: "invite", recovery: "reset" } as const;

/** A link works once, for a day. */
const LINK_HOURS = 24;

/**
 * Mint a one-time link for an account. Only the SHA-256 of the token is
 * stored, so a copy of the table yields no usable links. Older unused links
 * of the same kind are voided: the newest invitation is the only one that works.
 * Server-only: the caller must already be authorised.
 */
export async function issueToken(userId: string, type: LinkType): Promise<{ url: string; type: LinkType }> {
  const kind = KIND[type];
  const token = newToken();
  const sql = database();
  await sql`delete from erp.auth_tokens where user_id = ${userId} and kind = ${kind} and used_at is null`;
  await sql`
    insert into erp.auth_tokens (id, user_id, kind, expires_at)
    values (${tokenId(token)}, ${userId}, ${kind}, ${new Date(Date.now() + LINK_HOURS * 3600 * 1000).toISOString()}::timestamptz)`;
  await sql`delete from erp.auth_tokens where expires_at < now() - interval '7 days'`;
  const origin = await appOrigin();
  return { type, url: `${origin}/auth/accept?type=${type}&token=${encodeURIComponent(token)}` };
}

/**
 * Spend a link and return whose it was. Atomic: two requests with the same
 * token cannot both succeed. Wrong kind, expired, used and unknown all look
 * the same to the caller.
 */
export async function consumeToken(type: LinkType, token: string): Promise<string | null> {
  const [row] = await database()`
    update erp.auth_tokens set used_at = now()
    where id = ${tokenId(token)} and kind = ${KIND[type]} and used_at is null and expires_at > now()
    returning user_id`;
  return (row?.user_id as string | undefined) ?? null;
}

/** Email a link, in the recipient's interface language (Arabic by default). */
export async function emailAccountLink(to: string, type: LinkType, url: string) {
  const { t, locale } = await getI18n();
  const { html, text } = actionEmail({
    dir: locale === "ar" ? "rtl" : "ltr",
    heading: t(type === "invite" ? "mail.inviteHeading" : "mail.resetHeading"),
    body: t(type === "invite" ? "mail.inviteBody" : "mail.resetBody"),
    button: t(type === "invite" ? "mail.inviteButton" : "mail.resetButton"),
    url,
    footer: t("mail.footer"),
  });
  await sendMail({ to, subject: t(type === "invite" ? "mail.inviteSubject" : "mail.resetSubject"), html, text });
}
