/**
 * Rate limits for the public auth endpoints. Server only.
 *
 * Counters live in Postgres (erp.rate_limits, migration 0007) rather than in
 * memory, so a restart does not hand an attacker a fresh allowance. A hit is
 * counted with one INSERT … ON CONFLICT, which makes it atomic: fifty
 * parallel requests get fifty different counts, not fifty copies of "1".
 *
 * The limits are deliberately NOT a lock on the account. Locking an account
 * after N wrong passwords lets anyone who knows an email address lock its
 * owner out indefinitely. Sign-in is limited per (address, client) pair and
 * per client instead: an attacker exhausts only their own allowance.
 */

import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { database } from "@/lib/data/store";

/**
 * Count one hit on `key`; true while the count is still within `limit` for the
 * current window. A request over the limit is refused, and still counts, so
 * hammering a blocked key does not shorten the wait.
 */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const sql = database();
  const [row] = await sql`
    insert into erp.rate_limits (key, hits, window_start)
    values (${key}, 1, now())
    on conflict (key) do update set
      hits = case
        when erp.rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}::double precision)
        then 1 else erp.rate_limits.hits + 1 end,
      window_start = case
        when erp.rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}::double precision)
        then now() else erp.rate_limits.window_start end
    returning hits`;

  // Old rows are cleared now and then, on the way past, instead of by a scheduler.
  if (Math.random() < 0.01) {
    await sql`delete from erp.rate_limits where window_start < now() - interval '1 day'`;
  }
  return (row.hits as number) <= limit;
}

/** Forget a key — after a successful sign-in, so the real owner starts clean. */
export async function clear(key: string): Promise<void> {
  await database()`delete from erp.rate_limits where key = ${key}`;
}

/**
 * Who is asking. The app is reachable only through the Cloudflare tunnel (the
 * container publishes no port), and Cloudflare overwrites CF-Connecting-IP, so
 * the header is trustworthy there. Anywhere the app is reachable directly it
 * is not, which is why nothing here is the only line of defence.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const ip =
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  return ip.slice(0, 64);
}

/** A short stable key part from user-typed text, so a long address cannot bloat the table. */
export function keyPart(text: string): string {
  return createHash("sha256").update(text).digest("base64url").slice(0, 22);
}
