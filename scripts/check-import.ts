/**
 * Import logic checks. No database needed: the planner is pure and reads a
 * Database object, so this builds a small one by hand.
 *
 *   npx tsx scripts/check-import.ts
 */

import assert from "node:assert/strict";
import { parseCsv } from "../src/lib/import/csv";
import { templateCsv, toRecords } from "../src/lib/import/kinds";
import { parseDate, parseNumber, planImport } from "../src/lib/import/plan";
import type { Database } from "../src/lib/data/types";

const ts = "2026-10-03T00:00:00.000Z";
const base = (id: string) => ({ id, createdAt: ts, updatedAt: ts });
const today = "2026-10-04";
const h = () => ({ id: () => crypto.randomUUID(), now: () => ts });

const db = {
  settings: { defaultTaxRate: 20, lowStockDefault: 2 },
  users: [],
  categories: [{ ...base("cat1"), nameAr: "أجهزة", nameTr: "Cihaz", parentId: null, appliesTo: "product", sortOrder: 0 }],
  items: [
    {
      ...base("i1"), sku: "CHAIR-1", nameAr: "كرسي", nameTr: "", itemType: "product", categoryId: null, unit: "piece",
      cost: 500, price: 900, taxRate: 20, minStock: 0, brand: "", model: "", barcode: "", fitsItemIds: [], notes: "", active: true,
    },
  ],
  warehouses: [{ ...base("w1"), nameAr: "الرئيسي", nameTr: "Ana Depo", location: "", isDefault: true, active: true }],
  stockMoves: [],
  customers: [{ ...base("c1"), code: "C-1005", name: "عيادة قديمة", kind: "clinic", contactPerson: "", phone: "", email: "", address: "", city: "", taxNumber: "", creditLimit: 0, notes: "", active: true }],
  suppliers: [],
  salesInvoices: [],
  purchaseOrders: [],
  payments: [],
  expenses: [],
  serviceJobs: [],
  units: [],
} as unknown as Database;

const codes = (plan: ReturnType<typeof planImport>) => plan.results.map((r) => r.errors.map((e) => e.code));

// Parsing
assert.deepEqual(parseCsv('a;b\r\n"x;1";"he said ""hi"""\r\n\r\n'), [["a", "b"], ["x;1", 'he said "hi"']]);
assert.deepEqual(parseCsv("﻿a,b\n1,2"), [["a", "b"], ["1", "2"]]);
assert.equal(parseNumber("1.234,50"), 1234.5);
assert.equal(parseNumber("1,234.50"), 1234.5);
assert.equal(parseNumber("12,5"), 12.5);
assert.equal(parseNumber("٣٠"), 30);
assert.equal(parseNumber("abc"), null);
assert.equal(parseDate("04.10.2026"), "2026-10-04");
assert.equal(parseDate("2026-02-30"), null);

// Every template reads back into rows that pass, apart from what it deliberately leaves to the user
for (const kind of ["products", "spare_parts", "customers", "suppliers"] as const) {
  const t = toRecords(kind, parseCsv(templateCsv(kind)));
  assert.deepEqual(t.missing, [], kind);
  assert.equal(t.records.length, 1, kind);
  assert.equal(planImport(kind, t.records, db, today).ok, true, `${kind} template imports cleanly`);
}

// Missing required column is reported, unknown ones are ignored
const noName = toRecords("products", [["sku", "colour"], ["X", "red"]]);
assert.deepEqual(noName.missing, ["nameAr"]);
assert.deepEqual(noName.unknown, ["colour"]);

// Products
const products = planImport(
  "products",
  toRecords("products", [
    ["sku", "nameAr", "unit", "cost", "category", "tracksSerial", "warrantyMonths"],
    ["NEW-1", "جهاز", "piece", "10,5", "Cihaz", "yes", "24"],
    ["CHAIR-1", "موجود", "", "", "", "", ""],
    ["new-1", "مكرر", "", "", "", "", ""],
    ["NEW-2", "x", "", "abc", "", "", ""],
    ["NEW-3", "y", "crate", "", "", "", ""],
    ["NEW-4", "z", "", "", "Nowhere", "maybe", "1.5"],
  ]).records,
  db,
  today,
);
assert.equal(products.ok, false);
assert.deepEqual(codes(products), [[], ["exists"], ["duplicateInFile"], ["badNumber"], ["badUnit"], ["badCategory", "badBool", "wholeNumber"]]);

// Applying writes exactly the planned rows, with the settings defaults filled in
const applied = structuredClone(db);
const good = planImport("products", toRecords("products", [["sku", "nameAr", "tracksSerial", "warrantyMonths"], ["IMP-1", "أ", "yes", "12"], ["IMP-2", "ب", "", ""]]).records, applied, today);
assert.equal(good.ok, true);
good.apply(applied, h());
assert.equal(applied.items.length, 3);
const imp1 = applied.items.find((i) => i.sku === "IMP-1")!;
assert.equal(imp1.taxRate, 20);
assert.equal(imp1.tracksSerial, true);
assert.equal(imp1.warrantyMonths, 12);
assert.equal(planImport("products", toRecords("products", [["sku", "nameAr"], ["IMP-1", "أ"]]).records, applied, today).ok, false, "a re-upload is caught");

// Spare parts never track serials
const part = planImport("spare_parts", toRecords("spare_parts", [["sku", "nameAr"], ["SP-1", "قطعة"]]).records, db, today);
const withPart = structuredClone(db);
part.apply(withPart, h());
assert.equal("tracksSerial" in withPart.items.find((i) => i.sku === "SP-1")!, false);

// Customers: new codes continue the series (highest existing is C-1005), an explicit code is respected
const cust = planImport("customers", toRecords("customers", [["code", "name", "email"], ["", "عيادة أ", ""], ["C-1010", "عيادة ب", ""], ["", "عيادة ج", "bad"]]).records, db, today);
assert.deepEqual(codes(cust), [[], [], ["badEmail"]]);
const withCust = structuredClone(db);
planImport("customers", toRecords("customers", [["name"], ["عيادة أ"], ["عيادة ب"]]).records, withCust, today).apply(withCust, h());
assert.deepEqual(withCust.customers.slice(-2).map((c) => c.code), ["C-1006", "C-1007"]);
assert.deepEqual(codes(planImport("customers", toRecords("customers", [["name"], ["عيادة قديمة"]]).records, db, today)), [["exists"]]);

// Opening stock
const stock = planImport("opening_stock", toRecords("opening_stock", [["sku", "qty", "date", "warehouse"], ["chair-1", "7", "01/09/2026", "Ana Depo"], ["NOPE", "1", "", ""], ["CHAIR-1", "0", "", ""], ["CHAIR-1", "1", "2026-13-01", "Mars"]]).records, db, today);
assert.deepEqual(codes(stock), [[], ["unknownSku"], ["qtyPositive"], ["unknownWarehouse", "badDate"]]);
const withStock = structuredClone(db);
planImport("opening_stock", toRecords("opening_stock", [["sku", "qty"], ["CHAIR-1", "7"]]).records, withStock, today).apply(withStock, h());
const move = withStock.stockMoves[0];
assert.deepEqual([move.type, move.qtyDelta, move.unitCost, move.warehouseId, move.date], ["opening", 7, 500, "w1", today]);

console.log("import checks passed");
