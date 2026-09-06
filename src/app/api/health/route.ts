import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * Temporary deployment diagnostic.
 *
 * The hosted app was returning 500 on every route that reads data while the
 * same commit served 200 locally against a deliberately unwritable data
 * directory. This endpoint reports what the storage layer actually sees on the
 * host — which commit is running, where it is looking, and the exact errno for
 * each step — because the runtime logs were not reachable from here.
 *
 * Delete this file once the cause is known. It exposes no record data.
 */
export const dynamic = "force-dynamic";

async function probe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "ok";
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    return `${e?.code ?? "ERR"}: ${e?.message ?? String(err)}`;
  }
}

export async function GET() {
  const cwd = process.cwd();
  const dataDir = process.env.DENTEC_DATA_DIR
    ? path.resolve(process.env.DENTEC_DATA_DIR)
    : path.resolve(cwd, "data");
  const dbFile = path.join(dataDir, "dentec.json");

  const report: Record<string, unknown> = {
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "(not on vercel)",
    node: process.version,
    region: process.env.VERCEL_REGION ?? null,
    cwd,
    dataDir,
    readDbFile: await probe(() => fs.readFile(dbFile, "utf8")),
    statDataDir: await probe(() => fs.stat(dataDir)),
    mkdirDataDir: await probe(() => fs.mkdir(dataDir, { recursive: true })),
    writeTmp: await probe(() => fs.writeFile(path.join(dataDir, ".probe"), "x", "utf8")),
  };

  // The thing every failing page actually does.
  try {
    const { snapshot } = await import("@/lib/data/repository");
    const db = await snapshot();
    report.snapshot = `ok — ${db.salesInvoices.length} invoices, ${db.items.length} items`;
  } catch (err: unknown) {
    const e = err as Error;
    report.snapshot = `THREW ${e?.name}: ${e?.message}`;
    report.stack = e?.stack?.split("\n").slice(0, 6).join(" | ");
  }

  return NextResponse.json(report, {
    headers: { "cache-control": "no-store" },
  });
}
