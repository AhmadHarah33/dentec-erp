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
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error("check-store only runs against a local database");
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
    await assert.rejects(mutate((db) => void (db.stockMoves[0].qtyDelta = 999)), /append-only/);
    await assert.rejects(mutate((db) => void db.stockMoves.pop()), /append-only/);
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

  await closeDb();
  console.log(`\n${passed} checks passed`);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
