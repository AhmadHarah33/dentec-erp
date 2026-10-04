/**
 * Turn a seeded demo database into the file the showcase copy ships with.
 *
 *   1. node --import tsx scripts/dev-db.ts &                      (empty database)
 *   2. DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres DATABASE_POOL_SIZE=1 \
 *        DEMO_PASSWORD=<anything, 10+ chars> DEMO_SEED_CONFIRM=yes npx tsx scripts/seed-demo.ts
 *   3. DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres DATABASE_POOL_SIZE=1 \
 *        npx tsx scripts/build-demo-snapshot.ts
 *
 * Writes src/lib/data/demo-snapshot.json. Only business records go in it: no
 * password hashes, sessions or tokens (they live in tables outside the app's
 * data model), and the demo password is not stored anywhere.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { closeDb, getDb } from "../src/lib/data/store";
import { today } from "../src/lib/dates";
import { COLLECTIONS } from "../src/lib/data/schema-map";

async function main() {
  const db = await getDb();
  if (db.customers.length === 0 || db.salesInvoices.length === 0) {
    throw new Error("The database looks empty. Seed it with scripts/seed-demo.ts first.");
  }
  const out = path.resolve("src/lib/data/demo-snapshot.json");
  writeFileSync(out, JSON.stringify({ takenOn: today(), database: db }) + "\n");
  const counts = COLLECTIONS.map((name) => `${name}: ${(db[name] as unknown[]).length}`).join(", ");
  console.log(`Wrote ${out}\n${counts}`);
  await closeDb();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
