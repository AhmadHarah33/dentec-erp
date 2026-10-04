/**
 * Apply pending SQL migrations from supabase/migrations, in name order, each
 * exactly once. Applied names are recorded in erp.schema_migrations.
 *
 *   DATABASE_ADMIN_URL=postgres://postgres:<pw>@<host>:5432/postgres \
 *   APP_DB_PASSWORD=<new password for dentec_app> \
 *     npx tsx scripts/migrate.ts
 *
 * Runs as the database owner (DATABASE_ADMIN_URL), never as the app role.
 * When APP_DB_PASSWORD is set, the app role is given that password and the
 * right to log in; that is how the role's secret reaches the database
 * without ever being written into a migration file.
 *
 * --dry-run lists what would be applied and changes nothing.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

export interface MigrationTarget {
  /** Run a script of several statements (simple query protocol). */
  exec: (text: string) => Promise<unknown>;
  /** Run one parameterised query and return its rows. */
  query: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
}

const DIR = path.resolve("supabase/migrations");

export function migrationFiles(): string[] {
  return readdirSync(DIR)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
}

export async function pendingMigrations(db: MigrationTarget): Promise<string[]> {
  await db.exec(`
    create schema if not exists erp;
    create table if not exists erp.schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    );
    revoke all on erp.schema_migrations from public;
  `);
  const rows = await db.query("select name from erp.schema_migrations");
  const done = new Set(rows.map((r) => r.name as string));
  return migrationFiles().filter((f) => !done.has(f));
}

/** Apply every pending migration; each file carries its own begin/commit. */
export async function applyMigrations(
  db: MigrationTarget,
  log: (msg: string) => void = console.log,
): Promise<string[]> {
  const pending = await pendingMigrations(db);
  for (const file of pending) {
    await db.exec(readFileSync(path.join(DIR, file), "utf8"));
    await db.query("insert into erp.schema_migrations (name) values ($1)", [file]);
    log(`applied ${file}`);
  }
  return pending;
}

async function main() {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL is required (the owner role, not dentec_app)");
  const dryRun = process.argv.includes("--dry-run");

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const target: MigrationTarget = {
    exec: (text) => sql.unsafe(text),
    query: (text, params = []) =>
      sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]) as unknown as Promise<
        Record<string, unknown>[]
      >,
  };

  try {
    if (dryRun) {
      const pending = await pendingMigrations(target);
      console.log(pending.length ? `would apply: ${pending.join(", ")}` : "up to date");
      return;
    }
    const applied = await applyMigrations(target);
    if (applied.length === 0) console.log("up to date");

    const password = process.env.APP_DB_PASSWORD;
    if (password) {
      if (password.length < 24) throw new Error("APP_DB_PASSWORD must be at least 24 characters");
      // A password cannot be a bind parameter in ALTER ROLE; quote it as a literal.
      const literal = "'" + password.replace(/'/g, "''") + "'";
      await sql.unsafe(`alter role dentec_app login password ${literal}`);
      console.log("dentec_app can log in with the supplied password");
    }
  } finally {
    await sql.end();
  }
}

// Only run when invoked directly, not when dev-db imports the helpers.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
