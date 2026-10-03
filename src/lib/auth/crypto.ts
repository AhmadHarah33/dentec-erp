/**
 * Password hashing and token generation. Node's built-in crypto only — no
 * dependency to keep patched, and scrypt is a memory-hard KDF designed for
 * exactly this.
 */

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/** scrypt cost. 2^15 takes ~50–100 ms here: slow for an attacker, fine for a login. */
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * N * R * 2;

function derive(password: string, salt: Buffer, n = N, r = R, p = P): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** "scrypt$N$r$p$salt$hash", base64url. The parameters travel with the hash so they can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A random token for a cookie or a link. 32 bytes: not guessable, not enumerable. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What is stored in place of a token. A database leak yields no usable cookies or links. */
export function tokenId(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

/**
 * A hash to compare against when the account does not exist, so a wrong
 * email takes as long to reject as a wrong password — the timing must not
 * reveal who has an account.
 */
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  return (dummyHash ??= hashPassword(newToken()));
}
