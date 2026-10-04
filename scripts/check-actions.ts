/**
 * Runs the real server actions against a real Postgres, with the sign-in and
 * cache layers stubbed (scripts/stubs). Covers input validation, field
 * whitelisting, role checks, money rules, and — the point of it — races:
 * the same action fired many times at once.
 *
 *   node --import tsx scripts/dev-db.ts &              # fresh, empty
 *   DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres DATABASE_POOL_SIZE=1 \
 *     npx tsx scripts/check-actions.ts
 *
 * Run it against an EMPTY database. It never runs against the live server.
 */

import Module from "node:module";
import path from "node:path";

/* ---- Route the three things that only work inside Next to stubs ------- */
const stubs = path.resolve(__dirname, "stubs");
const mod = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const original = mod._resolveFilename;
mod._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === "next/cache") return path.join(stubs, "next-cache.ts");
  if (request === "server-only") return path.join(stubs, "empty.ts");
  const resolved = original.call(this, request, ...rest);
  if (resolved.replace(/\\/g, "/").endsWith("/src/lib/auth/server.ts")) return path.join(stubs, "auth-server.ts");
  return resolved;
};

type Result<T = unknown> = { ok: true; data: T } | { ok: false; errorKey: string; detail?: string };

let passed = 0;
let failed = 0;
function t(name: string, ok: boolean, extra = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${!ok && extra ? "  -> " + extra : ""}`);
}

function as(role: string) {
  (globalThis as unknown as { __member: unknown }).__member = {
    user: { id: `u-${role}`, name: role },
    role,
    email: `${role}@test`,
  };
}

async function main() {
  const { getDb, closeDb } = await import("../src/lib/data/store");
  const { buildStockIndex, onHand } = await import("../src/lib/stock");
  const sales = await import("../src/app/actions/sales");
  const stock = await import("../src/app/actions/stock");
  const catalog = await import("../src/app/actions/catalog");
  const parties = await import("../src/app/actions/parties");
  const purchasing = await import("../src/app/actions/purchasing");
  const service = await import("../src/app/actions/service");
  const admin = await import("../src/app/actions/admin");

  const stockOf = async (itemId: string, warehouseId?: string) => onHand(buildStockIndex((await getDb()).stockMoves), itemId, warehouseId);
  const ok = <T>(r: Result<T>): T => {
    if (!r.ok) throw new Error(`expected ok, got ${r.errorKey} ${r.detail ?? ""}`);
    return r.data;
  };
  const today = new Date().toISOString().slice(0, 10);

  /* ---- Seed through the real actions (which tests them too) ------------ */
  as("owner");
  const db0 = await getDb();
  const wh = db0.warehouses[0].id;
  const w2 = ok(await stock.saveWarehouse(null, { nameAr: "مستودع 2", nameTr: "Depo 2", location: "", isDefault: false, active: true }));
  const itemInput = (sku: string, over: Record<string, unknown> = {}) => ({
    sku, nameAr: sku, nameTr: sku, itemType: "product" as const, categoryId: null, unit: "piece" as const,
    cost: 50, price: 100, taxRate: 20, minStock: 0, brand: "", model: "", barcode: "", fitsItemIds: [], notes: "", active: true, ...over,
  });
  const mkItem = async (sku: string, qty: number) => {
    const id = ok(await catalog.saveItem(null, itemInput(sku) as never));
    if (qty > 0) ok(await stock.adjustStock({ itemId: id, warehouseId: wh, qtyDelta: qty, date: today, note: "opening" }));
    return id;
  };
  const partyInput = (code: string) => ({
    code, name: `Party ${code}`, kind: "clinic" as const, contactPerson: "", phone: "", email: "", address: "", city: "",
    taxNumber: "", creditLimit: 0, notes: "", active: true,
  });
  const cust = ok(await parties.saveParty("customers", null, partyInput("C1") as never));
  const supp = ok(await parties.saveParty("suppliers", null, partyInput("S1") as never));

  let lineSeq = 0;
  const invInput = (itemId: string | null, qty: number, over: Record<string, unknown> = {}) => ({
    date: today, dueDate: today, customerId: cust, warehouseId: wh, currency: "USD", fxRate: 1,
    discountKind: "percent", discountValue: 0, notes: "",
    lines: [{ id: `line-${++lineSeq}`, itemId, description: "line", qty, unitPrice: 100, discountPercent: 0, taxRate: 20 }],
    ...over,
  });
  const mkInvoice = async (itemId: string | null, qty: number) => {
    as("sales");
    const id = ok(await sales.saveInvoice(null, invInput(itemId, qty) as never));
    as("owner");
    return id;
  };

  console.log("\nInput: whitelisting and validation");
  {
    as("sales");
    const evil = invInput(null, 1, { status: "paid", number: "HACK-1", issuedAt: "2020-01-01T00:00:00.000Z", id: "evil", createdAt: "x" });
    const id = ok(await sales.saveInvoice(null, evil as never));
    let row = (await getDb()).salesInvoices.find((i) => i.id === id)!;
    t("a new invoice is a draft whatever the client says", row.status === "draft");
    t("its number comes from the server", /^INV-\d{4}-\d{4}$/.test(row.number) && row.number !== "HACK-1");
    t("a client-supplied id is ignored", id !== "evil");
    t("issuedAt cannot be forged", row.issuedAt === null);
    ok(await sales.saveInvoice(id, { ...evil, status: "paid", number: "HACK-2" } as never));
    row = (await getDb()).salesInvoices.find((i) => i.id === id)!;
    t("editing cannot promote a draft to paid or renumber it", row.status === "draft" && row.number !== "HACK-2");
    as("owner");
  }
  {
    const item = await mkItem("VAL-1", 5);
    const before = (await getDb()).stockMoves.length;
    const bad = async (label: string, p: Promise<Result>) => {
      const r = await p;
      t(label, !r.ok);
    };
    await bad("adjustStock rejects NaN", stock.adjustStock({ itemId: item, warehouseId: wh, qtyDelta: NaN, date: today, note: "" }));
    await bad("adjustStock rejects Infinity", stock.adjustStock({ itemId: item, warehouseId: wh, qtyDelta: Infinity, date: today, note: "" }));
    await bad("adjustStock rejects a string quantity", stock.adjustStock({ itemId: item, warehouseId: wh, qtyDelta: "5" as never, date: today, note: "" }));
    await bad("adjustStock rejects a bad date", stock.adjustStock({ itemId: item, warehouseId: wh, qtyDelta: 1, date: "2026-02-31", note: "" }));
    await bad("adjustStock rejects an unknown item", stock.adjustStock({ itemId: "nope", warehouseId: wh, qtyDelta: 1, date: today, note: "" }));
    await bad("transferStock rejects NaN", stock.transferStock({ itemId: item, fromWarehouseId: wh, toWarehouseId: w2, qty: NaN, date: today, note: "" }));
    t("none of those wrote a ledger row", (await getDb()).stockMoves.length === before);
    as("sales");
    await bad("an invoice line with NaN quantity is rejected", sales.saveInvoice(null, invInput(null, NaN) as never));
    await bad("a negative price is rejected", sales.saveInvoice(null, invInput(null, 1, { lines: [{ id: `line-${++lineSeq}`, itemId: null, description: "x", qty: 1, unitPrice: -5, discountPercent: 0, taxRate: 0 }] }) as never));
    await bad("an unknown customer is a result, not a crash", sales.saveInvoice(null, invInput(null, 1, { customerId: "nope" }) as never));
    as("owner");
    await bad("an order cannot be created as received", purchasing.saveOrder(null, { ...invInput(null, 1), supplierId: supp, expectedDate: today, status: "received" } as never));
    await bad("an unknown currency is rejected", admin.updateSettings({ baseCurrency: "BTC" } as never));
    await bad("an unknown role is rejected", admin.saveUser(null, { name: "x", email: "x@x", phone: "", role: "root", active: true } as never));
  }

  console.log("\nRoles");
  {
    const item = await mkItem("ROLE-1", 5);
    const inv = await mkInvoice(item, 1);
    as("technician");
    t("technician cannot create an invoice", !(await sales.saveInvoice(null, invInput(null, 1) as never)).ok);
    as("sales");
    t("sales cannot void", !(await sales.voidInvoice(inv)).ok);
    t("sales cannot record a payment", !(await sales.recordInvoicePayment({ invoiceId: inv, date: today, amount: 1, method: "cash", reference: "", note: "" })).ok);
    t("sales cannot adjust stock", !(await stock.adjustStock({ itemId: item, warehouseId: wh, qtyDelta: 1, date: today, note: "" })).ok);
    t("sales cannot edit the catalog", !(await catalog.saveItem(null, itemInput("NOPE") as never)).ok);
    as("viewer");
    t("viewer cannot edit anything", !(await catalog.saveItem(null, itemInput("NOPE2") as never)).ok);
    as("service_lead");
    t("service lead can adjust stock", (await stock.adjustStock({ itemId: item, warehouseId: wh, qtyDelta: 1, date: today, note: "" })).ok);
    as(" ");
    (globalThis as unknown as { __member: unknown }).__member = null;
    t("signed out, nothing works", !(await catalog.saveItem(null, itemInput("NOPE3") as never)).ok);
    as("owner");
  }

  console.log("\nRaces: the same action fired at once");
  {
    // Issue the same invoice 8 times at once.
    const item = await mkItem("RACE-ISSUE", 10);
    const inv = await mkInvoice(item, 3);
    as("sales");
    const r = await Promise.all(Array.from({ length: 8 }, () => sales.issueInvoice(inv)));
    as("owner");
    t("double issue: exactly one call succeeds", r.filter((x) => x.ok).length === 1, `${r.filter((x) => x.ok).length} succeeded`);
    t("double issue: stock goes down once (10 -> 7)", (await stockOf(item)) === 7, `on hand ${await stockOf(item)}`);

    // Two invoices competing for the last units.
    const a = await mkInvoice(item, 5);
    const b = await mkInvoice(item, 5);
    as("sales");
    const c = await Promise.all([sales.issueInvoice(a), sales.issueInvoice(b)]);
    as("owner");
    t("last units: only one of two competing invoices issues", c.filter((x) => x.ok).length === 1);
    t("last units: stock never negative (7 -> 2)", (await stockOf(item)) === 2, `on hand ${await stockOf(item)}`);

    // Void the issued one 8 times at once.
    const issued = (await getDb()).salesInvoices.find((i) => i.id === (c[0].ok ? a : b))!;
    const v = await Promise.all(Array.from({ length: 8 }, () => sales.voidInvoice(issued.id)));
    t("double void: exactly one call succeeds", v.filter((x) => x.ok).length === 1);
    t("double void: stock returned once (2 -> 7)", (await stockOf(item)) === 7, `on hand ${await stockOf(item)}`);

    // Overdraw by concurrent adjustments.
    const adj = await mkItem("RACE-ADJ", 10);
    const ar = await Promise.all(Array.from({ length: 6 }, () => stock.adjustStock({ itemId: adj, warehouseId: wh, qtyDelta: -4, date: today, note: "" })));
    t("concurrent adjustments: only 2 of 6 fit in 10", ar.filter((x) => x.ok).length === 2);
    t("concurrent adjustments: stock ends at 2, not negative", (await stockOf(adj)) === 2, `on hand ${await stockOf(adj)}`);

    // Overdraw by concurrent transfers.
    const tr = await mkItem("RACE-TR", 10);
    const trr = await Promise.all(Array.from({ length: 6 }, () => stock.transferStock({ itemId: tr, fromWarehouseId: wh, toWarehouseId: w2, qty: 4, date: today, note: "" })));
    t("concurrent transfers: only 2 of 6 fit in 10", trr.filter((x) => x.ok).length === 2);
    t("concurrent transfers: source 2, destination 8", (await stockOf(tr, wh)) === 2 && (await stockOf(tr, w2)) === 8);

    // Receive the same order several times at once.
    const rc = await mkItem("RACE-RCV", 0);
    const po = ok(await purchasing.saveOrder(null, { ...invInput(rc, 5), supplierId: supp, expectedDate: today, status: "ordered" } as never));
    const rr = await Promise.all(Array.from({ length: 6 }, () => purchasing.receiveOrder(po, today)));
    t("double receive: exactly one call succeeds", rr.filter((x) => x.ok).length === 1);
    t("double receive: stock +5 once", (await stockOf(rc)) === 5, `on hand ${await stockOf(rc)}`);

    // Same SKU saved at once: no throw, one row.
    const same = await Promise.allSettled(Array.from({ length: 6 }, () => catalog.saveItem(null, itemInput("RACE-SKU") as never)));
    t("concurrent duplicate SKU: nothing throws", same.every((x) => x.status === "fulfilled"));
    t("concurrent duplicate SKU: only one item created", (await getDb()).items.filter((i) => i.sku === "RACE-SKU").length === 1);
  }

  console.log("\nService jobs");
  {
    const part = await mkItem("SVC-PART", 10);
    const jobBase = {
      date: today, customerId: cust, machineItemId: null, machineLabel: "m", serialNo: "", reportedFault: "broken", diagnosis: "",
      status: "received", technicianId: null, laborCharge: 0, underWarranty: false, notes: "",
    };
    as("technician");
    const job = ok(await service.saveJob(null, { ...jobBase, parts: [{ id: "p1", itemId: part, qty: 2, unitPrice: 5, warehouseId: wh, consumed: true }] } as never));
    let row = (await getDb()).serviceJobs.find((j) => j.id === job)!;
    t("a part cannot be created already consumed", row.parts[0].consumed === false);
    const n = await Promise.all(Array.from({ length: 5 }, () => service.consumeParts(job)));
    t("double consume: stock deducted once (10 -> 8)", (await stockOf(part)) === 8, `on hand ${await stockOf(part)}`);
    t("double consume: no call failed", n.every((x) => x.ok));
    ok(await service.saveJob(job, { ...jobBase, parts: [{ id: "p1", itemId: part, qty: 2, unitPrice: 5, warehouseId: wh, consumed: false }] } as never));
    row = (await getDb()).serviceJobs.find((j) => j.id === job)!;
    t("a consumed part cannot be flipped back to unconsumed", row.parts[0].consumed === true);
    t("a consumed part cannot be removed or resized",
      !(await service.saveJob(job, { ...jobBase, parts: [{ id: "p1", itemId: part, qty: 9, unitPrice: 5, warehouseId: wh }] } as never)).ok);
    as("owner");
  }

  console.log("\nMoney");
  {
    const inv = await mkInvoice(null, 3); // 3 x 100 + 20% = 360
    as("sales");
    ok(await sales.issueInvoice(inv));
    t("sales cannot change a frozen conversion rate after issue",
      !(await sales.setInvoiceBilling(inv, { billingRegion: "SY", documentType: "export", localCurrency: "SYP", localRate: 9999 })).ok);
    as("owner");
    t("an owner can", (await sales.setInvoiceBilling(inv, { billingRegion: "SY", documentType: "export", localCurrency: "SYP", localRate: 9999 })).ok);
    const pay = (amount: number) => sales.recordInvoicePayment({ invoiceId: inv, date: today, amount, method: "cash", reference: "", note: "" });
    t("paying more than is owed is refused", (await pay(500)).ok === false);
    t("NaN payment is refused", (await pay(NaN)).ok === false);
    const pr = await Promise.all([pay(200), pay(200)]);
    t("two payments of 200 against 360: one fits, one is refused", pr.filter((x) => x.ok).length === 1);
    t("paying the exact remainder works", (await pay(160)).ok);
    const final = (await getDb()).salesInvoices.find((i) => i.id === inv)!;
    t("the invoice is then paid", final.status === "paid", final.status);
    t("and nothing more can be paid", (await pay(1)).ok === false);
  }

  console.log("\nSettings");
  {
    t("a valid settings patch is saved", (await admin.updateSettings({ companyName: "Dentec Test" })).ok);
    t("extra keys are ignored, not stored", (await admin.updateSettings({ companyName: "Dentec Test", updatedAt: "1999", evil: "x" } as never)).ok &&
      !("evil" in (await getDb()).settings));
  }

  await closeDb();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
