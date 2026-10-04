/**
 * Create the first owner and print a one-time link to set their password.
 *
 *   DATABASE_URL=postgres://… npx tsx scripts/create-owner.ts --email you@example.com --name "Your Name"
 *
 * Safe to run again: an existing person with that email is promoted to an
 * active owner and gets a fresh link (older unused invitations are voided).
 * The link goes to stdout only — nothing is stored in clear. APP_URL sets the
 * address in the link (default http://localhost:3000).
 */

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { newToken, tokenId } from "../src/lib/auth/crypto";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim() || "Owner";
  if (!email || !email.includes("@")) throw new Error("usage: create-owner --email <address> [--name <name>]");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    await sql.begin(async (tx) => {
      const [existing] = await tx`select id from erp.users where lower(email) = ${email}`;
      const id = (existing?.id as string | undefined) ?? randomUUID();
      if (existing) {
        await tx`update erp.users set role = 'owner', active = true, updated_at = now() where id = ${id}`;
      } else {
        await tx`insert into erp.users (id, name, email, role, active) values (${id}, ${name}, ${email}, 'owner', true)`;
      }

      const token = newToken();
      await tx`delete from erp.auth_tokens where user_id = ${id} and kind = 'invite' and used_at is null`;
      await tx`
        insert into erp.auth_tokens (id, user_id, kind, expires_at)
        values (${tokenId(token)}, ${id}, 'invite', now() + interval '24 hours')`;

      const origin = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
      console.log(`${existing ? "Updated" : "Created"} owner ${email}`);
      console.log(`Set the password within 24 hours:\n${origin}/auth/accept?type=invite&token=${encodeURIComponent(token)}`);
    });
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
