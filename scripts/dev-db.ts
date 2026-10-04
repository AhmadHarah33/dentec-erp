/**
 * A throwaway Postgres for local development and tests — no Docker, no
 * service, nothing installed system-wide. PGlite is real Postgres compiled
 * to WebAssembly; it runs inside this Node process and is gone when the
 * process exits.
 *
 *   npx tsx scripts/dev-db.ts            # in-memory, empty, port 54329
 *   npx tsx scripts/dev-db.ts --dir .pglite   # persisted to a folder
 *
 * Then run the app against it, with a single connection (PGlite is one
 * session; the socket server queues clients onto it):
 *
 *   DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres DATABASE_POOL_SIZE=1 npm run dev
 *
 * Limits: there is one superuser session, so roles, grants and RLS are not
 * enforced here, and concurrency is serialised. Those are verified against
 * the real Supabase on the server, not here.
 */

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { applyMigrations } from "./migrate";

const args = process.argv.slice(2);
const dirFlag = args.indexOf("--dir");
const dataDir = dirFlag >= 0 ? args[dirFlag + 1] : undefined;
const port = Number(process.env.DEV_DB_PORT ?? 54329);

async function main() {
  const db = await PGlite.create(dataDir ? { dataDir } : {});

  // The same runner the server uses, so both are migrated the same way.
  await applyMigrations(
    {
      exec: (text) => db.exec(text),
      query: (text, params) => db.query(text, params).then((r) => r.rows as Record<string, unknown>[]),
    },
    (msg) => console.log(`[dev-db] ${msg}`),
  );

  // Next's dev server holds several connections at once. The socket server
  // queues every query onto PGlite's single session, and while one
  // connection has a transaction open it serves only that connection, so
  // transactions run one after another rather than interleaving.
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 8 });
  server.addEventListener("connection", () =>
    console.log(`[dev-db] client connected (${server.getStats().activeConnections} open)`),
  );
  await server.start();
  console.log(`[dev-db] listening on postgres://postgres@127.0.0.1:${port}/postgres`);

  const stop = async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
