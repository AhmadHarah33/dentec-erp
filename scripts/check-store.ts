/**
 * Store-level checks against a real Postgres.
 *
 *   npx tsx scripts/dev-db.ts &                       # fresh, empty
 *   DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres DATABASE_POOL_SIZE=1 \
 *     npx tsx scripts/check-store.ts
 *
 * Run it against an EMPTY database: it writes records and expects to find
 * exactly what it wrote. It never runs against the live server database.
 */

import assert from "node:assert/strict";
import postgres from "postgres";
import { closeDb, getDb, mutate } from "../src/lib/data/store";
import type { Database, SalesInvoice, ServiceJob } from "../src/lib/data/types";

const url = process.env.DATABASE_URL!;
let passed = 0;

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`);
    throw err;
  }
}

/** A fresh process's view: drop the pool and cache, read everything again. */
async function reread(): Promise<Database> {
  await closeDb();
  return getDb();
}

const ts = "2026-10-03T10:00:00.000Z";
const base = (id: string) => ({ id, createdAt: ts, updatedAt: ts });

async function main() {
  // It writes test records — including ledger moves, which can never be
  // deleted — so it refuses any database not obviously a test one.
  const target = new URL(url);
  const isDevDb = target.port === "54329";
  const isTestDb = target.pathname.replace("/", "").endsWith("_test");
  if (!["127.0.0.1", "localhost"].includes(target.hostname) || !(isDevDb || isTestDb)) {
    throw new Error("check-store only runs against the local dev database or a *_test database");
  }

  await check("empty database: settings, one warehouse, nothing else", async () => {
    const db = await getDb();
    assert.equal(db.settings.baseCurrency, "USD");
    assert.equal(db.warehouses.length, 1);
    assert.equal(db.warehouses[0].isDefault, true);
    for (const k of ["items", "customers", "salesInvoices", "stockMoves", "users"] as const) {
      assert.equal(db[k].length, 0, k);
    }
  });

  const job: ServiceJob = {
    ...base("job1"),
    number: "SRV-2026-0001",
    date: "2026-10-01",
    customerId: "cu1",
    machineItemId: "it1",
    machineLabel: "Autoclave 18L",
    serialNo: "SN-1",
    reportedFault: "leak",
    diagnosis: "",
    status: "received",
    technicianId: "u1",
    laborCharge: 40,
    underWarranty: false,
    parts: [
      { id: "p1", itemId: "it2", qty: 2, unitPrice: 12.5, warehouseId: "wh-main", consumed: false },
      { id: "p2", itemId: "it2", qty: 1, unitPrice: 12.5, warehouseId: "wh-main", consumed: true },
    ],
    notes: "",
    closedAt: null,
  };

  const invoice: SalesInvoice = {
    ...base("inv1"),
    number: "INV-2026-0001",
    date: "2026-10-02",
    dueDate: "2026-11-01",
    customerId: "cu1",
    warehouseId: "wh-main",
    currency: "TRY",
    fxRate: 0.0291234567,
    status: "draft",
    discountKind: "percent",
    discountValue: 5,
    lines: [
      { id: "l1", itemId: "it1", description: "", qty: 1, unitPrice: 1234.56, discountPercent: 0, taxRate: 20 },
      { id: "l2", itemId: null, description: "Labour", qty: 1.5, unitPrice: 0.1 + 0.2, discountPercent: 10, taxRate: 0 },
    ],
    notes: "",
    issuedAt: null,
    billingRegion: "TR",
    documentType: "e_arsiv",
  };

  await check("round trip: every collection, nested lines, json, optionals", async () => {
    await mutate((db) => {
      db.users.push({ ...base("u1"), name: "Omar", email: "o@x.test", phone: "", role: "technician", active: true });
      db.categories.push({ ...base("c1"), nameAr: "أجهزة", nameTr: "Cihaz", parentId: null, appliesTo: "both", sortOrder: 0 });
      db.categories.push({ ...base("c2"), nameAr: "فرعي", nameTr: "", parentId: "c1", appliesTo: "product", sortOrder: 1 });
      db.items.push({
        ...base("it1"), sku: "AUTO-18", nameAr: "جهاز تعقيم", nameTr: "Otoklav", itemType: "product",
        categoryId: "c2", unit: "piece", cost: 900, price: 1234.56, taxRate: 20, minStock: 1,
        brand: "", model: "", barcode: "", fitsItemIds: [], notes: "", active: true,
      });
      db.items.push({
        ...base("it2"), sku: "SP-GASKET", nameAr: "حشوة", nameTr: "Conta", itemType: "spare_part",
        categoryId: null, unit: "piece", cost: 4, price: 12.5, taxRate: 20, minStock: 5,
        brand: "", model: "", barcode: "", fitsItemIds: ["it1"], notes: "", active: true,
      });
      db.customers.push({
        ...base("cu1"), code: "C1", name: "عيادة", kind: "clinic", contactPerson: "", phone: "+90 553 636 2468",
        email: "", address: "", city: "İstanbul", taxNumber: "", creditLimit: 0, notes: "", active: true,
        billingRegion: "TR",
        turkey: { taxIdKind: "vkn", taxId: "1234567890", taxOffice: "Beyoğlu", tradeRegistryNo: "", gibAlias: "", eInvoiceUser: false, mersisNo: "" },
      });
      // No billingRegion / turkey / syria: they must read back absent, not null.
      db.suppliers.push({
        ...base("su1"), code: "S1", name: "NSK", kind: "dealer", contactPerson: "", phone: "", email: "",
        address: "", city: "", taxNumber: "", creditLimit: 0, notes: "", active: true,
      });
      db.serviceJobs.push(job);
      db.salesInvoices.push(invoice);
      db.purchaseOrders.push({
        ...base("po1"), number: "PO-2026-0001", date: "2026-10-01", expectedDate: "2026-10-10",
        supplierId: "su1", warehouseId: "wh-main", currency: "USD", fxRate: 1, status: "draft",
        discountKind: "amount", discountValue: 0, notes: "", receivedAt: null, serviceJobId: "job1",
        lines: [{ id: "pl1", itemId: "it2", description: "", qty: 10, unitPrice: 4, discountPercent: 0, taxRate: 20 }],
      });
      db.stockMoves.push({
        ...base("m1"), date: "2026-10-01", itemId: "it2", warehouseId: "wh-main", qtyDelta: 25,
        type: "opening", refType: "manual", refId: null, unitCost: 4, note: "",
      });
      db.payments.push({
        ...base("pay1"), date: "2026-10-02", direction: "in", partyType: "customer", partyId: "cu1",
        invoiceId: null, amount: 100, currency: "USD", fxRate: 1, method: "cash", reference: "", note: "",
      });
      db.expenses.push({
        ...base("ex1"), date: "2026-10-02", category: "rent", amount: 500, currency: "USD", fxRate: 1,
        method: "bank", description: "October",
      });
    });

    const db = await reread();
    assert.deepEqual(db.salesInvoices, [invoice]);
    assert.deepEqual(db.serviceJobs, [{ ...job, invoiceId: undefined }].map(({ invoiceId: _, ...j }) => j));
    assert.equal(db.purchaseOrders[0].serviceJobId, "job1");
    assert.deepEqual(db.items[1].fitsItemIds, ["it1"]);
    assert.equal(db.customers[0].turkey?.taxOffice, "Beyoğlu");
    assert.equal("billingRegion" in db.suppliers[0], false);
    assert.equal("turkey" in db.suppliers[0], false);
    assert.equal(db.stockMoves[0].qtyDelta, 25);
    assert.equal(db.categories[1].parentId, "c1");
  });

  await check("editing lines replaces them, in order", async () => {
    await mutate((db) => {
      const inv = db.salesInvoices.find((i) => i.id === "inv1")!;
      inv.lines = [inv.lines[1], { ...inv.lines[0], id: "l3", qty: 3 }];
    });
    const db = await reread();
    assert.deepEqual(db.salesInvoices[0].lines.map((l) => [l.id, l.qty]), [["l2", 1.5], ["l3", 3]]);
  });

  await check("a callback that throws leaves no trace, in the database or the cache", async () => {
    await assert.rejects(
      mutate((db) => {
        db.expenses.push({ ...db.expenses[0], id: "ex-ghost" });
        db.settings.companyName = "ghost";
        throw new Error("boom");
      }),
      /boom/,
    );
    const cached = await getDb();
    assert.equal(cached.expenses.length, 1);
    assert.notEqual(cached.settings.companyName, "ghost");
    const db = await reread();
    assert.equal(db.expenses.length, 1);
    assert.notEqual(db.settings.companyName, "ghost");
  });

  await check("the stock ledger refuses an edit and a delete", async () => {
    // Two layers refuse this: the app role has no UPDATE/DELETE privilege on
    // the ledger (the error a real deployment sees), and a trigger rejects
    // it even for the owner (the error the local superuser sees).
    const refused = /append-only|permission denied for table stock_moves/;
    await assert.rejects(mutate((db) => void (db.stockMoves[0].qtyDelta = 999)), refused);
    await assert.rejects(mutate((db) => void db.stockMoves.pop()), refused);
    const db = await reread();
    assert.equal(db.stockMoves.length, 1);
    assert.equal(db.stockMoves[0].qtyDelta, 25);
  });

  await check("an item still on the ledger cannot be deleted", async () => {
    await assert.rejects(mutate((db) => void db.items.splice(1, 1)), /foreign key/);
    assert.equal((await reread()).items.length, 2);
  });

  await check("deleting a job's draft invoice un-bills the job", async () => {
    await mutate((db) => void (db.serviceJobs[0].invoiceId = "inv1"));
    assert.equal((await reread()).serviceJobs[0].invoiceId, "inv1");
    await mutate((db) => void db.salesInvoices.splice(0, 1));
    // Same process, no reread: the cache must notice the FK action itself.
    const db = await getDb();
    assert.equal(db.salesInvoices.length, 0);
    assert.equal("invoiceId" in db.serviceJobs[0], false);
  });

  await check("a write from another instance is seen on the next read", async () => {
    await getDb();
    // The local database takes one connection at a time, so this instance
    // steps aside (cache kept) while "another instance" writes.
    await closeDb({ keepCache: true });
    const other = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
    await other`update erp.expenses set description = 'changed elsewhere' where id = 'ex1'`;
    await other.end();
    const db = await getDb();
    assert.equal(db.expenses[0].description, "changed elsewhere");
  });

  await check("settings round-trip, updatedAt tracked by the database", async () => {
    await mutate((db) => {
      db.settings = { ...db.settings, companyName: "Dentec", iban: "TR00 0000" };
    });
    const db = await reread();
    assert.equal(db.settings.companyName, "Dentec");
    assert.equal(db.settings.iban, "TR00 0000");
    assert.match(db.settings.updatedAt, /^\d{4}-\d\d-\d\dT/);
  });

  await check("sequential writes each see the one before", async () => {
    const numbers: string[] = [];
    for (let i = 0; i < 5; i++) {
      numbers.push(
        await mutate((db) => {
          const n = `INV-2026-${String(db.salesInvoices.length + 1).padStart(4, "0")}`;
          db.salesInvoices.push({ ...invoice, id: "seq" + i, number: n, lines: [] });
          return n;
        }),
      );
    }
    assert.deepEqual(numbers, ["INV-2026-0001", "INV-2026-0002", "INV-2026-0003", "INV-2026-0004", "INV-2026-0005"]);
  });

  await check("ten simultaneous writes mint ten distinct, consecutive numbers", async () => {
    // All ten start before any finishes. On a real server with a pool of
    // several connections they genuinely overlap; the advisory lock is what
    // keeps each one reading the table as the previous one left it.
    const minted = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        mutate((db) => {
          const n = `PAR-${String(db.salesInvoices.filter((x) => x.number.startsWith("PAR-")).length + 1).padStart(4, "0")}`;
          db.salesInvoices.push({ ...invoice, id: "par" + i, number: n, lines: [] });
          return n;
        }),
      ),
    );
    assert.deepEqual(
      [...minted].sort(),
      Array.from({ length: 10 }, (_, i) => `PAR-${String(i + 1).padStart(4, "0")}`),
    );
    const db = await reread();
    assert.equal(db.salesInvoices.filter((x) => x.number.startsWith("PAR-")).length, 10);
  });

  await check("serial units, serial lines and received quantities survive a round trip", async () => {
    await mutate((db) => {
      db.items.push({
        ...base("m9"), sku: "SER-1", nameAr: "جهاز", nameTr: "", itemType: "product", categoryId: null, unit: "piece",
        cost: 1, price: 2, taxRate: 20, minStock: 0, brand: "", model: "", barcode: "", fitsItemIds: [], notes: "",
        active: true, tracksSerial: true, warrantyMonths: 12,
      });
      db.salesInvoices.push({
        ...invoice, id: "sn1", number: "SN-0001",
        lines: [{ id: "snl", itemId: "m9", description: "", qty: 2, unitPrice: 2, discountPercent: 0, taxRate: 20, serials: ["A-1", "A-2"] }],
      });
      db.units.push({
        ...base("un1"), itemId: "m9", serialNo: "A-1", customerId: null, invoiceId: "sn1", soldAt: "2026-10-04",
        warrantyEnd: "2027-10-04", notes: "",
      });
      db.purchaseOrders.push({
        ...base("po9"), number: "PO-9", date: "2026-10-04", expectedDate: "2026-10-10", supplierId: "su1", warehouseId: db.warehouses[0].id,
        currency: "USD", fxRate: 1, status: "partial", discountKind: "percent", discountValue: 0,
        lines: [{ id: "plrq", itemId: "m9", description: "", qty: 10, unitPrice: 1, discountPercent: 0, taxRate: 0, receivedQty: 4 }],
        notes: "", receivedAt: null,
      });
    });
    const db = await reread();
    assert.deepEqual(db.salesInvoices.find((i) => i.id === "sn1")!.lines[0].serials, ["A-1", "A-2"]);
    assert.equal(db.purchaseOrders.find((o) => o.id === "po9")!.lines[0].receivedQty, 4);
    assert.equal(db.units.find((u) => u.id === "un1")!.warrantyEnd, "2027-10-04");
    assert.equal(db.items.find((i) => i.id === "m9")!.tracksSerial, true);
  });

  await check("the same serial cannot be registered twice for one item, in any case", async () => {
    await assert.rejects(
      mutate((db) => {
        db.units.push({ ...base("un2"), itemId: "m9", serialNo: "a-1", customerId: null, invoiceId: null, soldAt: null, warrantyEnd: null, notes: "" });
      }),
    );
  });

  await check("every change is written to the audit log, with only the changed fields on an update", async () => {
    const sql = postgres(url, { max: 1 });
    try {
      await mutate((db) => {
        db.suppliers.find((x) => x.id === "su1")!.phone = "0555";
      });
      const rows = await sql`
        select action, before, after from erp.audit_log
        where collection = 'suppliers' and record_id = 'su1' order by id desc limit 1`;
      assert.equal(rows[0].action, "update");
      assert.deepEqual(rows[0].after, { phone: "0555" });
      // The ledger is not repeated in the log, but an invoice is.
      const inserted = await sql`select count(*)::int as n from erp.audit_log where collection = 'salesInvoices' and action = 'insert'`;
      assert.ok(inserted[0].n >= 1);
      const ledger = await sql`select count(*)::int as n from erp.audit_log where collection = 'stockMoves'`;
      assert.equal(ledger[0].n, 0);
    } finally {
      await sql.end();
    }
  });

  await check("the audit log refuses an edit and a delete", async () => {
    const sql = postgres(url, { max: 1 });
    try {
      await assert.rejects(sql`update erp.audit_log set label = 'x'`);
      await assert.rejects(sql`delete from erp.audit_log`);
    } finally {
      await sql.end();
    }
  });

  await closeDb();
  console.log(`\n${passed} checks passed`);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
