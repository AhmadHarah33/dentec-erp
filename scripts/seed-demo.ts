/**
 * Fill an EMPTY database with a fictional but realistic business, for a
 * showcase copy of the app (see DEMO.md). It goes through the real server
 * actions, so stock moves, serial units, payments and statuses are exactly
 * what the app itself would have produced — nothing is inserted by hand
 * except the sign-in accounts.
 *
 *   DATABASE_URL=postgres://… DEMO_PASSWORD=<10+ chars> DEMO_SEED_CONFIRM=yes \
 *     npx tsx scripts/seed-demo.ts
 *
 * Safety: it refuses to run unless the database has no users, customers,
 * items or invoices, refuses the production box's addresses, and never
 * deletes or updates anything that exists. Run it only on a database made for
 * the demo.
 */

import Module from "node:module";
import path from "node:path";

/* ---- The actions expect a request; route the three Next-only imports to stubs ---- */
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

/** Unwrap a Result or stop with a message that says which step failed. */
function must<T>(step: string, r: Result<T>): T {
  if (!r.ok) throw new Error(`${step}: ${r.errorKey}${r.detail ? ` (${r.detail})` : ""}`);
  return r.data;
}

/** Small deterministic generator, so the demo looks the same every time it is seeded. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  /* ---- Guards ---------------------------------------------------------- */
  const url = process.env.DATABASE_URL;
  const password = process.env.DEMO_PASSWORD ?? "";
  if (!url) throw new Error("DATABASE_URL is required");
  if (process.env.DEMO_SEED_CONFIRM !== "yes") throw new Error("Set DEMO_SEED_CONFIRM=yes to confirm this is a demo database");
  if (password.length < 10) throw new Error("DEMO_PASSWORD (10+ characters) is required: it is the password of every demo account");
  const host = new URL(url).hostname;
  if (host === "db" || host.startsWith("10.") || host.endsWith("dentec.cloud")) {
    throw new Error(`Refusing ${host}: that looks like the production database`);
  }

  const { getDb, database, closeDb } = await import("../src/lib/data/store");
  const { hashPassword } = await import("../src/lib/auth/crypto");
  const { computeTotals, round2 } = await import("../src/lib/money");
  const { addDays, today } = await import("../src/lib/dates");
  const admin = await import("../src/app/actions/admin");
  const catalog = await import("../src/app/actions/catalog");
  const parties = await import("../src/app/actions/parties");
  const stock = await import("../src/app/actions/stock");
  const purchasing = await import("../src/app/actions/purchasing");
  const sales = await import("../src/app/actions/sales");
  const finance = await import("../src/app/actions/finance");
  const service = await import("../src/app/actions/service");
  const workflow = await import("../src/app/actions/service-workflow");

  const before = await getDb();
  if (before.users.length || before.customers.length || before.items.length || before.salesInvoices.length) {
    throw new Error("The database already has data. The demo seed only runs on an empty one.");
  }
  console.log(`Seeding the demo into ${host} …`);

  const rand = rng(20261004);
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
  const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const T = today();
  const clamp = (d: string) => (d > T ? T : d);
  let seq = 0;
  const lineId = () => `ln-${Date.now().toString(36)}-${++seq}`;

  const as = (u: { id: string; name: string; role: string; email: string }) => {
    (globalThis as unknown as { __member: unknown }).__member = { user: { id: u.id, name: u.name }, role: u.role, email: u.email };
  };

  /* ---- Accounts -------------------------------------------------------- */
  const sql = database();
  const accounts = [
    { name: "أحمد الحلبي", email: "demo-owner@dentec.demo", role: "owner" },
    { name: "ليلى الصالح", email: "demo-accountant@dentec.demo", role: "accountant" },
    { name: "Mert Yılmaz", email: "demo-sales@dentec.demo", role: "sales" },
    { name: "خالد النجار", email: "demo-technician@dentec.demo", role: "technician" },
    { name: "Zeynep Kaya", email: "demo-viewer@dentec.demo", role: "viewer" },
  ] as const;
  const hash = await hashPassword(password);
  // The very first owner has to exist before anyone can be signed in to create the rest.
  const ownerId = crypto.randomUUID();
  await sql`insert into erp.users (id, name, email, phone, role, active) values (${ownerId}, ${accounts[0].name}, ${accounts[0].email}, '', 'owner', true)`;
  const people: Record<string, { id: string; name: string; role: string; email: string }> = {
    owner: { id: ownerId, name: accounts[0].name, role: "owner", email: accounts[0].email },
  };
  as(people.owner);
  for (const a of accounts.slice(1)) {
    const id = must(`user ${a.role}`, await admin.saveUser(null, { name: a.name, email: a.email, phone: "", role: a.role, active: true }));
    people[a.role] = { id, name: a.name, role: a.role, email: a.email };
  }
  for (const p of Object.values(people)) {
    await sql`insert into erp.credentials (user_id, password_hash) values (${p.id}, ${hash}) on conflict (user_id) do nothing`;
  }

  /* ---- Company --------------------------------------------------------- */
  must("settings", await admin.updateSettings({
    companyName: "دينتك للتجهيزات الطبية (عرض تجريبي)",
    companyNameTr: "Dentec Dental Ekipman (Demo)",
    address: "Şahinbey Sanayi Sitesi, Gaziantep, Türkiye",
    phone: "+90 342 000 00 00",
    email: "info@dentec.demo",
    taxNumber: "1234567890",
    baseCurrency: "USD",
    currencies: [{ code: "USD", rate: 1 }, { code: "TRY", rate: 0.03 }, { code: "EUR", rate: 1.08 }],
    defaultTaxRate: 20,
    lowStockDefault: 5,
    bankName: "Demo Bank",
    bankAccountName: "Dentec Dental Ekipman",
    iban: "TR00 0000 0000 0000 0000 0000 00",
    swift: "DEMOTRXX",
    warrantyTerms: "ضمان المصنّع على الأجهزة وفق المدة المذكورة. لا يشمل الضمان سوء الاستخدام.",
  }));

  /* ---- Catalog --------------------------------------------------------- */
  as(people.owner);
  const mainWh = (await getDb()).warehouses[0].id;
  const showroom = must("warehouse", await stock.saveWarehouse(null, { nameAr: "صالة العرض", nameTr: "Showroom", location: "Gaziantep", isDefault: false, active: true }));

  const cat: Record<string, string> = {};
  for (const [key, ar, tr, scope] of [
    ["chairs", "كراسي الأسنان", "Diş Üniteleri", "product"],
    ["steril", "التعقيم", "Sterilizasyon", "product"],
    ["imaging", "التصوير الشعاعي", "Görüntüleme", "product"],
    ["small", "أجهزة صغيرة", "Küçük Cihazlar", "product"],
    ["parts", "قطع الغيار", "Yedek Parçalar", "spare_part"],
  ] as const) {
    cat[key] = must(`category ${key}`, await catalog.saveCategory(null, { nameAr: ar, nameTr: tr, parentId: null, appliesTo: scope, sortOrder: Object.keys(cat).length }));
  }

  interface Def { sku: string; ar: string; tr: string; type: "product" | "spare_part"; cat: string; cost: number; price: number; serial?: boolean; warranty?: number; brand?: string; model?: string; min: number }
  const defs: Def[] = [
    { sku: "DU-001", ar: "M200 LUXURY", tr: "M200 LUXURY", type: "product", cat: "chairs", cost: 3800, price: 6000, serial: true, warranty: 24, brand: "MIPONT", model: "M200 LUXURY", min: 2 },
    { sku: "DU-002", ar: "كرسي أسنان اقتصادي", tr: "Ekonomik Diş Ünitesi", type: "product", cat: "chairs", cost: 2000, price: 3200, serial: true, warranty: 18, brand: "Dentec", model: "E-100", min: 2 },
    { sku: "AC-100", ar: "جهاز تعقيم 18 لتر", tr: "Otoklav 18 L", type: "product", cat: "steril", cost: 1500, price: 2400, serial: true, warranty: 12, brand: "Sterimax", model: "S18", min: 2 },
    { sku: "XR-200", ar: "حساس أشعة رقمي", tr: "Dijital Röntgen Sensörü", type: "product", cat: "imaging", cost: 1900, price: 2900, serial: true, warranty: 12, brand: "VisionX", model: "RVG-2", min: 1 },
    { sku: "CM-310", ar: "جهاز تصليب ضوئي", tr: "Işık Cihazı (LED)", type: "product", cat: "small", cost: 190, price: 380, brand: "Dentec", model: "LC-3", min: 6 },
    { sku: "SC-410", ar: "جهاز تنظيف بالموجات فوق الصوتية", tr: "Ultrasonik Kireç Temizleme", type: "product", cat: "small", cost: 290, price: 520, brand: "Dentec", model: "US-4", min: 5 },
    { sku: "SP-101", ar: "توربين يد عالية السرعة", tr: "Yüksek Hız Türbin", type: "spare_part", cat: "parts", cost: 38, price: 85, min: 15 },
    { sku: "SP-102", ar: "دواسة قدم", tr: "Ayak Pedalı", type: "spare_part", cat: "parts", cost: 45, price: 95, min: 8 },
    { sku: "SP-103", ar: "خرطوم شفط", tr: "Aspiratör Hortumu", type: "spare_part", cat: "parts", cost: 9, price: 22, min: 20 },
    { sku: "SP-104", ar: "حشية جهاز التعقيم", tr: "Otoklav Contası", type: "spare_part", cat: "parts", cost: 14, price: 35, min: 20 },
    { sku: "SP-105", ar: "فلتر ماء", tr: "Su Filtresi", type: "spare_part", cat: "parts", cost: 6, price: 16, min: 30 },
    { sku: "SP-106", ar: "مصباح LED للكرسي", tr: "Ünit LED Lamba", type: "spare_part", cat: "parts", cost: 25, price: 60, min: 10 },
  ];
  const item: Record<string, { id: string; def: Def }> = {};
  for (const d of defs) {
    const id = must(`item ${d.sku}`, await catalog.saveItem(null, {
      sku: d.sku, nameAr: d.ar, nameTr: d.tr, itemType: d.type, categoryId: cat[d.cat], unit: "piece",
      cost: d.cost, price: d.price, taxRate: 20, minStock: d.min, brand: d.brand ?? "", model: d.model ?? "", barcode: "",
      fitsItemIds: [], notes: "", active: true,
      ...(d.serial ? { tracksSerial: true, warrantyMonths: d.warranty } : {}),
    }));
    item[d.sku] = { id, def: d };
  }
  // Which machines each spare part fits.
  for (const sku of ["SP-101", "SP-102", "SP-103", "SP-106"]) {
    const d = item[sku].def;
    must(`fits ${sku}`, await catalog.saveItem(item[sku].id, {
      sku: d.sku, nameAr: d.ar, nameTr: d.tr, itemType: d.type, categoryId: cat[d.cat], unit: "piece", cost: d.cost, price: d.price,
      taxRate: 20, minStock: d.min, brand: "", model: "", barcode: "", fitsItemIds: [item["DU-001"].id, item["DU-002"].id], notes: "", active: true,
    }));
  }

  /* ---- Customers and suppliers ----------------------------------------- */
  as(people.accountant);
  const mk = (code: string, name: string, kind: string, city: string, region: "TR" | "SY", extra: Record<string, unknown> = {}, gibAlias = "") => ({
    code, name, kind, contactPerson: "", phone: `+${region === "TR" ? "90 5" : "963 9"}${between(10, 99)} ${between(100, 999)} ${between(1000, 9999)}`,
    email: "", address: "", city, taxNumber: String(between(1000000000, 9999999999)), creditLimit: 0, notes: "", active: true, billingRegion: region,
    ...(region === "TR"
      ? { turkey: { taxIdKind: "vkn", taxId: String(between(1000000000, 9999999999)), taxOffice: `${city} V.D.`, tradeRegistryNo: String(between(10000, 99999)), gibAlias, eInvoiceUser: Boolean(gibAlias), mersisNo: "" } }
      : { syria: { commercialRegisterNo: String(between(10000, 99999)), importLicenseNo: String(between(1000, 9999)), customsOffice: "معبر باب السلامة", exemptionNote: "معفاة من الضريبة عند التصدير" } }),
    ...extra,
  });
  const custDefs = [
    mk("C-001", "عيادة الدكتورة ميرا", "clinic", "حلب", "SY"),
    mk("C-002", "مركز النور لطب الأسنان", "clinic", "دمشق", "SY", { creditLimit: 15000 }),
    mk("C-003", "مستشفى الشام التخصصي", "hospital", "حمص", "SY", { creditLimit: 40000 }),
    mk("C-004", "Gaziantep Ağız ve Diş Sağlığı", "hospital", "Gaziantep", "TR", { creditLimit: 30000 }, "urn:mail:defaultpk@gdsh.demo"),
    mk("C-005", "Dt. Selin Arslan Kliniği", "clinic", "İstanbul", "TR"),
    mk("C-006", "Hatay Dental Lab", "lab", "Hatay", "TR"),
    mk("C-007", "Akdeniz Dental Dealer", "dealer", "Mersin", "TR", { creditLimit: 60000 }, "urn:mail:defaultpk@akdeniz.demo"),
    mk("C-008", "عيادات الأمل", "clinic", "اللاذقية", "SY"),
  ];
  // Two Turkish customers (those with a GİB alias) are registered e-Fatura users, which changes the document type.
  const customers = [] as { id: string; region: "TR" | "SY"; einvoice: boolean }[];
  for (const c of custDefs) {
    const id = must(`customer ${c.code}`, await parties.saveParty("customers", null, c as never));
    customers.push({ id, region: c.billingRegion as "TR" | "SY", einvoice: Boolean(("turkey" in c ? c.turkey.eInvoiceUser : false)) });
  }
  const suppliers: string[] = [];
  for (const [code, name, city] of [["S-001", "MIPONT Dental Co.", "Istanbul"], ["S-002", "Sterimax Medical", "Izmir"], ["S-003", "Parça Dental Yedek", "Ankara"]] as const) {
    suppliers.push(must(`supplier ${code}`, await parties.saveParty("suppliers", null, { ...mk(code, name, "dealer", city, "TR"), kind: "dealer" } as never)));
  }

  /* ---- Opening stock through real purchase orders ----------------------- */
  const stockLeft: Record<string, number> = {};
  const buy = async (date: string, supplier: string, lines: [string, number][], received: "all" | "part" | "none" | "draft") => {
    const body = lines.map(([sku, qty]) => ({ id: lineId(), itemId: item[sku].id, description: "", qty, unitPrice: item[sku].def.cost, discountPercent: 0, taxRate: 20 }));
    const id = must(`PO ${date}`, await purchasing.saveOrder(null, {
      date, expectedDate: addDays(date, 14), supplierId: supplier, warehouseId: mainWh, currency: "USD", fxRate: 1,
      discountKind: "percent", discountValue: 0, lines: body, notes: "", status: received === "draft" ? "draft" : "ordered",
    } as never));
    if (received === "all") {
      must("receive", await purchasing.receiveOrder(id, addDays(date, 9)));
      for (const [sku, qty] of lines) stockLeft[sku] = (stockLeft[sku] ?? 0) + qty;
    } else if (received === "part") {
      const q: Record<string, number> = {};
      body.forEach((l, i) => (q[l.id] = Math.floor(lines[i][1] / 2)));
      must("receive part", await purchasing.receiveOrder(id, addDays(date, 9), q));
      lines.forEach(([sku, qty]) => (stockLeft[sku] = (stockLeft[sku] ?? 0) + Math.floor(qty / 2)));
    }
    return id;
  };
  as(people.owner);
  const d0 = (n: number) => addDays(T, -n);
  await buy(d0(330), suppliers[0], [["DU-001", 14], ["DU-002", 12], ["SP-101", 60], ["SP-102", 30], ["SP-103", 90], ["SP-106", 30]], "all");
  await buy(d0(320), suppliers[1], [["AC-100", 12], ["XR-200", 8], ["SP-104", 40], ["SP-105", 80]], "all");
  await buy(d0(300), suppliers[2], [["CM-310", 30], ["SC-410", 24]], "all");
  await buy(d0(150), suppliers[0], [["DU-001", 6], ["DU-002", 6], ["SP-101", 30]], "all");
  await buy(d0(20), suppliers[1], [["AC-100", 6], ["SP-104", 24]], "part"); // half arrived: shows a partial order
  await buy(d0(6), suppliers[0], [["DU-001", 4], ["SP-102", 10]], "none"); // ordered, not yet received
  await buy(d0(2), suppliers[2], [["CM-310", 12]], "draft");

  /* ---- A year of sales -------------------------------------------------- */
  const serialCount: Record<string, number> = {};
  const issuedInvoices: { id: string; total: number; currency: string; date: string }[] = [];
  const perMonth = [2, 2, 3, 2, 3, 3, 4, 4, 4, 5, 5, 4];
  const methods = ["cash", "bank", "bank", "cheque", "card"] as const;

  async function sellOne(date: string, wantIssue: boolean, opts: { void?: boolean } = {}) {
    const cu = pick(customers);
    const currency = cu.region === "TR" ? "TRY" : "USD";
    const fx = currency === "TRY" ? 0.03 : 1;
    const nLines = between(1, 3);
    const chosen = new Set<string>();
    const lines: { id: string; itemId: string; description: string; qty: number; unitPrice: number; discountPercent: number; taxRate: number }[] = [];
    const serials: Record<string, string[]> = {};
    for (let i = 0; i < nLines; i++) {
      const sku = pick(defs).sku;
      if (chosen.has(sku)) continue;
      const it = item[sku];
      let qty = it.def.serial ? between(1, 2) : it.def.type === "product" ? between(1, 4) : between(1, 8);
      qty = Math.min(qty, stockLeft[sku] ?? 0);
      if (qty <= 0) continue;
      chosen.add(sku);
      stockLeft[sku] -= qty;
      const id = lineId();
      lines.push({ id, itemId: it.id, description: "", qty, unitPrice: round2(it.def.price / fx), discountPercent: rand() < 0.2 ? pick([5, 10]) : 0, taxRate: 20 });
      if (it.def.serial) {
        serialCount[sku] = serialCount[sku] ?? 0;
        serials[id] = Array.from({ length: qty }, () => `${sku}-${date.slice(2, 4)}${date.slice(5, 7)}-${String(++serialCount[sku]).padStart(4, "0")}`);
      }
    }
    if (lines.length === 0) return;
    as(people.sales);
    const id = must("invoice", await sales.saveInvoice(null, {
      date, dueDate: addDays(date, 30), customerId: cu.id, warehouseId: mainWh, currency, fxRate: fx,
      discountKind: "percent", discountValue: 0, lines, notes: "",
      billingRegion: cu.region, documentType: cu.region === "SY" ? "export" : cu.einvoice ? "e_fatura" : "e_arsiv",
    } as never));
    if (!wantIssue) return;
    must("issue", await sales.issueInvoice(id, serials));
    const total = computeTotals(lines as never, "percent", 0).total;
    if (opts.void) {
      as(people.owner);
      must("void", await sales.voidInvoice(id));
      return;
    }
    issuedInvoices.push({ id, total, currency, date });
    // Most invoices get paid; the older an invoice, the likelier it is settled, so only
    // recent ones are open or overdue. A year-old unpaid pile would make the dashboard alarming.
    const old = date < addDays(T, -60);
    const roll = old ? rand() * 0.58 : rand(); // old: always settled in full
    as(people.accountant);
    const pay = async (amount: number, when: string) =>
      must("payment", await sales.recordInvoicePayment({ invoiceId: id, date: clamp(when), amount: round2(amount), method: pick(methods), reference: rand() < 0.5 ? `REF-${between(10000, 99999)}` : "", note: "" }));
    if (date > addDays(T, -10)) return; // too recent to be paid yet
    if (roll < 0.58) await pay(total, addDays(date, between(3, 28)));
    else if (roll < 0.72) await pay(total * pick([0.3, 0.5, 0.6]), addDays(date, between(5, 25)));
  }

  for (let m = 11; m >= 0; m--) {
    const count = perMonth[11 - m];
    for (let k = 0; k < count; k++) {
      const date = clamp(addDays(T, -(m * 30 + between(0, 27))));
      await sellOne(date, true);
    }
  }
  await sellOne(d0(40), true, { void: true });
  await sellOne(d0(3), true); // this month, still open
  await sellOne(d0(2), false); // drafts, so the invoices list shows every status
  await sellOne(d0(1), false);

  /* ---- Money out ---------------------------------------------------------- */
  as(people.accountant);
  for (let m = 11; m >= 0; m--) {
    const base = -(m * 30) - 2;
    const exp = async (category: string, desc: string, amount: number) =>
      must("expense", await finance.saveExpense(null, { date: clamp(addDays(T, base)), category, amount, currency: "USD", fxRate: 1, method: "bank", description: desc } as never));
    await exp("rent", "إيجار المستودع والمعرض", 1800);
    await exp("salaries", "رواتب الموظفين", 6200);
    await exp("utilities", "كهرباء وماء واتصالات", between(300, 460));
    if (m % 2 === 0) await exp("shipping", "شحن وتخليص جمركي", between(250, 900));
    if (m % 3 === 0) await exp("marketing", "إعلانات ومعارض", between(200, 700));
  }
  for (const [days, sup, amount, ref] of [[322, 0, 35000, "SUP-PAY-001"], [312, 1, 24000, "SUP-PAY-002"], [150, 0, 12000, "SUP-PAY-003"]] as const) {
    must("supplier payment", await finance.savePayment(null, {
      date: d0(days), direction: "out", partyType: "supplier", partyId: suppliers[sup], invoiceId: null, amount, currency: "USD", fxRate: 1,
      method: "bank", reference: ref, note: "",
    } as never));
  }

  /* ---- Service workshop -------------------------------------------------- */
  const units = (await getDb()).units;
  const tech = people.technician;
  const jobDefs: { daysAgo: number; fault: string; status: string; parts: [string, number][]; consume: boolean; labor: number; unit?: number; warranty?: boolean }[] = [
    { daysAgo: 1, fault: "الكرسي لا يرتفع", status: "received", parts: [], consume: false, labor: 0, unit: 0 },
    { daysAgo: 2, fault: "تسرّب ماء من التوربين", status: "received", parts: [], consume: false, labor: 0 },
    { daysAgo: 4, fault: "جهاز التعقيم لا يصل للضغط", status: "diagnosed", parts: [["SP-104", 1]], consume: false, labor: 60, unit: 1 },
    { daysAgo: 6, fault: "ضعف في الشفط", status: "awaiting_parts", parts: [["SP-103", 400]], consume: false, labor: 40 },
    { daysAgo: 8, fault: "المصباح لا يعمل", status: "awaiting_parts", parts: [["SP-106", 300]], consume: false, labor: 35, unit: 2 },
    { daysAgo: 11, fault: "دواسة القدم معطّلة", status: "in_progress", parts: [["SP-102", 1]], consume: true, labor: 50 },
    { daysAgo: 15, fault: "حساس الأشعة لا يتصل", status: "done", parts: [], consume: false, labor: 90, warranty: true },
    { daysAgo: 3, fault: "تبديل توربين ومرشح ماء", status: "delivered", parts: [["SP-101", 1], ["SP-105", 2]], consume: true, labor: 70 },
    { daysAgo: 27, fault: "صيانة دورية", status: "delivered", parts: [["SP-105", 1]], consume: true, labor: 45, unit: 3 },
  ];
  let invoicedOne = false;
  for (const j of jobDefs) {
    as(people.technician);
    const date = d0(j.daysAgo);
    const owner = units[j.unit ?? -1];
    const cu = owner?.customerId ?? pick(customers).id;
    const parts = j.parts.map(([sku, qty]) => ({ id: lineId(), itemId: item[sku].id, qty, unitPrice: item[sku].def.price, warehouseId: mainWh }));
    const id = must("job", await service.saveJob(null, {
      date, customerId: cu, machineItemId: owner?.itemId ?? null, machineLabel: owner ? "" : pick(["كرسي أسنان", "جهاز تعقيم", "حساس أشعة"]),
      serialNo: owner?.serialNo ?? "", unitId: owner?.id ?? undefined, reportedFault: j.fault, diagnosis: j.status === "received" ? "" : "تم الفحص وتحديد العطل",
      status: "received", technicianId: tech.id, laborCharge: j.labor, underWarranty: Boolean(j.warranty), parts, notes: "",
    } as never));
    if (j.consume && parts.length) must("consume", await service.consumeParts(id));
    if (j.status !== "received") must("status", await service.setJobStatus(id, j.status as never));
    if (j.status === "awaiting_parts") {
      as(people.owner);
      await workflow.orderShortage(id); // drafts the purchase order that would unblock it; fine if nothing is short
    }
    if (j.status === "delivered" && !invoicedOne) {
      as(people.sales);
      must("invoice job", await workflow.invoiceJob(id));
      invoicedOne = true;
    }
  }

  /* ---- Report ------------------------------------------------------------- */
  const after = await getDb();
  console.log("\nDone. Created:");
  console.log(`  ${after.users.length} accounts, ${after.customers.length} customers, ${after.suppliers.length} suppliers, ${after.items.length} items`);
  console.log(`  ${after.purchaseOrders.length} purchase orders, ${after.salesInvoices.length} invoices, ${after.payments.length} payments, ${after.expenses.length} expenses`);
  console.log(`  ${after.serviceJobs.length} service jobs, ${after.units.length} serial-tracked machines, ${after.stockMoves.length} stock moves`);
  console.log("\nSign in (all accounts share DEMO_PASSWORD):");
  for (const a of accounts) console.log(`  ${a.role.padEnd(11)} ${a.email}`);
  void showroom;
  await closeDb();
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("\nSeed failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
