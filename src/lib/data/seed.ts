/**
 * Demo data. Runs once, the first time the app starts with no data file.
 *
 * It is generated rather than hand-listed so the dashboard, the trend chart
 * and the aging report all have twelve honest months behind them — a seed of
 * five rows makes every chart a lie and hides layout problems.
 */

import type {
  Category,
  Customer,
  Database,
  Expense,
  ExpenseCategory,
  ID,
  Item,
  Payment,
  PaymentMethod,
  PurchaseOrder,
  SalesInvoice,
  ServiceJob,
  ServiceStatus,
  Settings,
  StockMove,
  Supplier,
  User,
  Warehouse,
} from "./types";

/* ------------------------------------------------------------------ */
/* Deterministic randomness — same seed every time, so bug reports     */
/* against demo data are reproducible.                                 */
/* ------------------------------------------------------------------ */

let state = 0x2f6e2b1;
function rnd(): number {
  state = (state * 1664525 + 1013904223) >>> 0;
  return state / 0x100000000;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}
function int(min: number, max: number): number {
  return Math.floor(rnd() * (max - min + 1)) + min;
}

const NOW = new Date();
const nowISO = NOW.toISOString();

function stamp(id: ID) {
  return { id, createdAt: nowISO, updatedAt: nowISO };
}

function dayISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** A date `monthsAgo` months back, on `day`. */
function backDate(monthsAgo: number, day: number): string {
  const d = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - monthsAgo, 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return dayISO(d);
}

function addDaysStr(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return dayISO(d);
}

/* ------------------------------------------------------------------ */

export function buildSeed(): Database {
  state = 0x2f6e2b1; // reset so repeated calls match

  const settings: Settings = {
    companyName: "شركة دينتك للتجهيزات الطبية",
    companyNameTr: "Dentec Medikal Ekipman",
    address: "شارع الجمهورية، بناء رقم ١٢، الطابق الثاني",
    phone: "+90 212 555 0134",
    email: "info@dentec.example",
    taxNumber: "3820199471",
    baseCurrency: "USD",
    currencies: [
      { code: "USD", rate: 1 },
      { code: "TRY", rate: 0.029 },
      { code: "EUR", rate: 1.08 },
      { code: "SAR", rate: 0.266 },
    ],
    defaultTaxRate: 20,
    lowStockDefault: 3,
    invoicePrefix: "INV",
    purchasePrefix: "PO",
    servicePrefix: "SRV",
    updatedAt: nowISO,
  };

  /* Users --------------------------------------------------------- */
  const users: User[] = [
    ["u1", "هارا أحمد", "hara@dentec.example", "owner"],
    ["u2", "ليلى منصور", "laila@dentec.example", "accountant"],
    ["u3", "سامر الخطيب", "samer@dentec.example", "sales"],
    ["u4", "عمر يلماز", "omar@dentec.example", "technician"],
    ["u5", "رنا حداد", "rana@dentec.example", "technician"],
  ].map(([id, name, email, role]) => ({
    ...stamp(id),
    name,
    email,
    phone: "+90 5" + int(30, 55) + " " + int(100, 999) + " " + int(1000, 9999),
    role: role as User["role"],
    active: true,
  }));

  /* Warehouses ---------------------------------------------------- */
  const warehouses: Warehouse[] = [
    {
      ...stamp("w1"),
      nameAr: "المستودع الرئيسي",
      nameTr: "Ana Depo",
      location: "المنطقة الصناعية — مبنى A",
      isDefault: true,
      active: true,
    },
    {
      ...stamp("w2"),
      nameAr: "مستودع المعرض",
      nameTr: "Showroom Deposu",
      location: "صالة العرض — الطابق الأرضي",
      isDefault: false,
      active: true,
    },
    {
      ...stamp("w3"),
      nameAr: "مستودع الصيانة",
      nameTr: "Servis Deposu",
      location: "ورشة الصيانة",
      isDefault: false,
      active: true,
    },
  ];

  /* Categories ---------------------------------------------------- */
  const catDefs: [ID, string, string, ID | null, Category["appliesTo"]][] = [
    ["c1", "كراسي الأسنان", "Diş Üniteleri", null, "product"],
    ["c2", "أجهزة التصوير", "Görüntüleme", null, "product"],
    ["c3", "أجهزة التعقيم", "Sterilizasyon", null, "product"],
    ["c4", "معدات المختبر", "Laboratuvar", null, "product"],
    ["c5", "الأدوات اليدوية", "El Aletleri", null, "both"],
    ["c6", "أنظمة الهواء والشفط", "Hava ve Vakum", null, "product"],
    ["c7", "قطع غيار الكراسي", "Ünit Yedek Parça", "c1", "spare_part"],
    ["c8", "قطع غيار التعقيم", "Sterilizatör Parça", "c3", "spare_part"],
    ["c9", "قطع غيار التربينات", "Türbin Parça", "c5", "spare_part"],
    ["c10", "مواد استهلاكية", "Sarf Malzeme", null, "both"],
  ];
  const categories: Category[] = catDefs.map(([id, ar, tr, parent, scope], i) => ({
    ...stamp(id),
    nameAr: ar,
    nameTr: tr,
    parentId: parent,
    appliesTo: scope,
    sortOrder: i,
  }));

  /* Items --------------------------------------------------------- */
  type ItemDef = [
    id: ID,
    sku: string,
    ar: string,
    tr: string,
    cat: ID,
    brand: string,
    model: string,
    cost: number,
    price: number,
    min: number,
    unit: Item["unit"],
  ];

  const productDefs: ItemDef[] = [
    ["p1", "CHR-S30", "كرسي أسنان متكامل S30", "Diş Ünitesi S30", "c1", "Siger", "S30", 3850, 5400, 2, "piece"],
    ["p2", "CHR-V1000", "كرسي أسنان V1000 بشاشة", "Diş Ünitesi V1000", "c1", "Siger", "V1000", 5200, 7300, 2, "piece"],
    ["p3", "CHR-U200", "كرسي أسنان اقتصادي U200", "Diş Ünitesi U200", "c1", "Runyes", "U200", 2600, 3750, 3, "piece"],
    ["p4", "IMG-PAN9", "جهاز أشعة بانورامي رقمي", "Panoramik Röntgen", "c2", "Fona", "XPan 3D", 21000, 28500, 1, "piece"],
    ["p5", "IMG-RAY68", "جهاز أشعة داخل الفم", "İntraoral Röntgen", "c2", "Runyes", "Ray68", 1450, 2100, 2, "piece"],
    ["p6", "IMG-SENS", "حساس أشعة رقمي مقاس ٢", "Dijital Sensör", "c2", "Woodpecker", "i-Sensor", 2300, 3200, 2, "piece"],
    ["p7", "STR-AC23", "جهاز تعقيم أوتوكلاف ٢٣ لتر", "Otoklav 23L", "c3", "Melag", "Vacuklav 23", 3400, 4750, 2, "piece"],
    ["p8", "STR-AC18", "جهاز تعقيم أوتوكلاف ١٨ لتر", "Otoklav 18L", "c3", "Runyes", "AC-18", 1900, 2700, 3, "piece"],
    ["p9", "STR-SEAL", "جهاز لحام أكياس التعقيم", "Poşet Kapama", "c3", "Runyes", "SL-260", 380, 590, 4, "piece"],
    ["p10", "LAB-MIX", "خلاط جبس فراغي", "Vakumlu Karıştırıcı", "c4", "Coxo", "CX-M300", 720, 1080, 2, "piece"],
    ["p11", "LAB-MOTOR", "موتور مختبر ميكرو", "Mikromotor", "c4", "NSK", "Ultimate XL", 890, 1290, 3, "piece"],
    ["p12", "HND-PANA", "تربين هوائي عالي السرعة", "Yüksek Devir Türbin", "c5", "NSK", "Pana Max Plus", 165, 265, 10, "piece"],
    ["p13", "HND-CONTRA", "كونترا انجل ١:١", "Anguldruva 1:1", "c5", "NSK", "Ti-Max", 210, 330, 8, "piece"],
    ["p14", "HND-SCALER", "جهاز تنظيف بالموجات فوق الصوتية", "Ultrasonik Kaviratör", "c5", "Woodpecker", "UDS-K LED", 240, 385, 6, "piece"],
    ["p15", "HND-CURE", "جهاز تصليب ضوئي LED", "Işık Cihazı LED", "c5", "Woodpecker", "LED-F", 95, 168, 12, "piece"],
    ["p16", "AIR-COMP", "كمبريسور هواء خالٍ من الزيت ٦٠ لتر", "Yağsız Kompresör 60L", "c6", "Woodpecker", "DC-60", 640, 940, 3, "piece"],
    ["p17", "AIR-SUCT", "وحدة شفط مركزية", "Merkezi Vakum", "c6", "Coxo", "CX-V500", 1180, 1650, 2, "piece"],
  ];

  const partDefs: ItemDef[] = [
    ["s1", "SP-MOTOR", "موتور رفع الكرسي", "Ünit Kaldırma Motoru", "c7", "Siger", "LM-24", 145, 235, 4, "piece"],
    ["s2", "SP-VALVE", "صمام هواء ثلاثي", "Üçlü Hava Valfi", "c7", "Siger", "AV-3", 28, 52, 12, "piece"],
    ["s3", "SP-HOSE", "خرطوم تربين ٤ فتحات", "Türbin Hortumu 4 Delik", "c7", "Coxo", "H4", 16, 32, 20, "piece"],
    ["s4", "SP-LAMP", "لمبة كشاف كرسي LED", "Ünit Lamba LED", "c7", "Siger", "L-700", 78, 138, 8, "piece"],
    ["s5", "SP-FOOT", "مفتاح قدم متعدد الوظائف", "Ayak Pedalı", "c7", "Runyes", "FP-2", 42, 78, 10, "piece"],
    ["s6", "SP-PCB", "كرت إلكتروني للتحكم", "Kontrol Kartı", "c7", "Siger", "PCB-S30", 190, 310, 3, "piece"],
    ["s7", "SP-GASKET", "حشوة باب أوتوكلاف", "Otoklav Kapı Contası", "c8", "Melag", "G-23", 34, 62, 15, "piece"],
    ["s8", "SP-HEATER", "سخان أوتوكلاف ٢٣ لتر", "Otoklav Isıtıcı", "c8", "Melag", "HT-23", 118, 195, 5, "piece"],
    ["s9", "SP-FILTER", "فلتر ماء للتعقيم", "Su Filtresi", "c8", "Runyes", "WF-1", 12, 26, 30, "piece"],
    ["s10", "SP-ROTOR", "روتور تربين", "Türbin Rotoru", "c9", "NSK", "R-PanaMax", 46, 88, 25, "piece"],
    ["s11", "SP-BEAR", "طقم بيرنغ تربين", "Türbin Rulman Seti", "c9", "NSK", "B-Set", 22, 45, 30, "piece"],
    ["s12", "SP-BATT", "بطارية جهاز التصليب", "Işık Cihazı Bataryası", "c9", "Woodpecker", "BT-F", 18, 36, 20, "piece"],
    ["s13", "SP-TIP", "أطراف جهاز التنظيف (طقم)", "Kaviratör Uç Seti", "c10", "Woodpecker", "T-Set5", 24, 48, 25, "set"],
    ["s14", "SP-POUCH", "أكياس تعقيم ٩٠×٢٦٠ مم", "Sterilizasyon Poşeti", "c10", "Runyes", "SP-90", 9, 19, 40, "box"],
  ];

  function toItem(d: ItemDef, itemType: Item["itemType"]): Item {
    const [id, sku, nameAr, nameTr, categoryId, brand, model, cost, price, minStock, unit] = d;
    return {
      ...stamp(id),
      sku,
      nameAr,
      nameTr,
      itemType,
      categoryId,
      unit,
      cost,
      price,
      taxRate: settings.defaultTaxRate,
      minStock,
      brand,
      model,
      barcode: "868" + String(2000000 + int(1, 999999)),
      fitsItemIds: [],
      notes: "",
      active: true,
    };
  }

  const items: Item[] = [
    ...productDefs.map((d) => toItem(d, "product")),
    ...partDefs.map((d) => toItem(d, "spare_part")),
  ];

  // Wire spare parts to the machines they fit — this is what makes the
  // spare-parts page useful rather than just a second product list.
  const fits: Record<string, string[]> = {
    s1: ["p1", "p2", "p3"],
    s2: ["p1", "p2", "p3"],
    s3: ["p1", "p2", "p3"],
    s4: ["p1", "p2"],
    s5: ["p1", "p2", "p3"],
    s6: ["p1", "p2"],
    s7: ["p7", "p8"],
    s8: ["p7", "p8"],
    s9: ["p7", "p8"],
    s10: ["p12"],
    s11: ["p12", "p13"],
    s12: ["p15"],
    s13: ["p14"],
  };
  for (const it of items) {
    if (fits[it.id]) it.fitsItemIds = fits[it.id];
  }

  /* Parties ------------------------------------------------------- */
  const customerDefs: [string, string, Customer["kind"], string][] = [
    ["عيادة د. مروان الشامي", "دمشق", "clinic", "المزة — شارع الجلاء"],
    ["مركز الابتسامة التخصصي", "إسطنبول", "clinic", "Kadıköy, Bağdat Cd. 118"],
    ["مستشفى الرازي التخصصي", "حلب", "hospital", "الفرقان — دوار الجامعة"],
    ["عيادة د. هبة قاسم", "إسطنبول", "clinic", "Şişli, Halaskargazi Cd. 42"],
    ["مختبر النور لتركيبات الأسنان", "دمشق", "lab", "الميدان — شارع الزاهرة"],
    ["مجمع الحياة الطبي", "أنقرة", "hospital", "Çankaya, Tunalı Hilmi 76"],
    ["عيادة د. أحمد التميمي", "بورصة", "clinic", "Osmangazi, Atatürk Cd. 9"],
    ["شركة الشرق للتجهيزات الطبية", "بيروت", "dealer", "الحمرا — بناء كريدية"],
    ["مركز دنتال كير", "إزمير", "clinic", "Konak, Şair Eşref Blv. 22"],
    ["عيادة د. سلمى ديب", "دمشق", "clinic", "أبو رمانة — شارع الجزائر"],
    ["مختبر التاج الذهبي", "إسطنبول", "lab", "Fatih, Akşemsettin Mh."],
    ["مستشفى الأمل الجامعي", "حمص", "hospital", "الإنشاءات — طريق حماة"],
  ];

  const customers: Customer[] = customerDefs.map((d, i) => ({
    ...stamp("cu" + (i + 1)),
    code: "C-" + String(1001 + i),
    name: d[0],
    kind: d[2],
    contactPerson: pick(["م. خالد", "أ. نور", "د. رامي", "أ. سعاد", "م. طارق"]),
    phone: "+90 5" + int(30, 55) + " " + int(100, 999) + " " + int(1000, 9999),
    email: "contact" + (i + 1) + "@example.com",
    address: d[3],
    city: d[1],
    taxNumber: String(int(1000000000, 9999999999)),
    creditLimit: pick([0, 5000, 10000, 15000, 25000]),
    notes: "",
    active: true,
  }));

  const supplierDefs: [string, string, string][] = [
    ["Siger Medical Co.", "الصين", "شنغهاي"],
    ["NSK Turkey Distribution", "تركيا", "إسطنبول"],
    ["Melag Medizintechnik", "ألمانيا", "برلين"],
    ["Woodpecker Medical", "الصين", "قويلين"],
    ["Runyes Medical Instrument", "الصين", "نينغبو"],
    ["Fona Dental Europe", "إيطاليا", "ميلانو"],
  ];

  const suppliers: Supplier[] = supplierDefs.map((d, i) => ({
    ...stamp("su" + (i + 1)),
    code: "S-" + String(2001 + i),
    name: d[0],
    kind: "dealer",
    contactPerson: pick(["Mr. Chen", "Ms. Kaya", "Herr Weber", "Mr. Li", "Sig. Rossi"]),
    phone: "+" + int(30, 90) + " " + int(200, 999) + " " + int(1000000, 9999999),
    email: "sales@supplier" + (i + 1) + ".example",
    address: d[2],
    city: d[1],
    taxNumber: String(int(1000000000, 9999999999)),
    creditLimit: 0,
    notes: "",
    active: true,
  }));

  /* Ledgers ------------------------------------------------------- */
  const stockMoves: StockMove[] = [];
  const salesInvoices: SalesInvoice[] = [];
  const purchaseOrders: PurchaseOrder[] = [];
  const payments: Payment[] = [];
  const expenses: Expense[] = [];
  const serviceJobs: ServiceJob[] = [];

  let moveSeq = 0;
  function move(m: Omit<StockMove, "id" | "createdAt" | "updatedAt">): void {
    stockMoves.push({ ...stamp("mv" + ++moveSeq), ...m });
  }

  // Opening balances, 13 months back. Generous enough that a year of
  // simulated sales never drives a line negative.
  const openingDate = backDate(13, 1);
  for (const it of items) {
    const qty = it.itemType === "product" ? it.minStock * 5 + int(2, 10) : it.minStock * 6 + int(10, 40);
    move({
      date: openingDate,
      itemId: it.id,
      warehouseId: "w1",
      qtyDelta: qty,
      type: "opening",
      refType: "manual",
      refId: null,
      unitCost: it.cost,
      note: "رصيد افتتاحي",
    });
    // A slice of each product also sits in the showroom.
    if (it.itemType === "product" && rnd() > 0.4) {
      move({
        date: openingDate,
        itemId: it.id,
        warehouseId: "w2",
        qtyDelta: int(1, 3),
        type: "opening",
        refType: "manual",
        refId: null,
        unitCost: it.cost,
        note: "رصيد افتتاحي — المعرض",
      });
    }
    // Spare parts are also staged in the service workshop.
    if (it.itemType === "spare_part" && rnd() > 0.35) {
      move({
        date: openingDate,
        itemId: it.id,
        warehouseId: "w3",
        qtyDelta: int(2, 12),
        type: "opening",
        refType: "manual",
        refId: null,
        unitCost: it.cost,
        note: "رصيد افتتاحي — الورشة",
      });
    }
  }

  const products = items.filter((i) => i.itemType === "product");
  const parts = items.filter((i) => i.itemType === "spare_part");
  const year = NOW.getUTCFullYear();

  /* Purchase orders — one or two a month, received. */
  let poSeq = 0;
  for (let m = 12; m >= 0; m--) {
    const count = m === 0 ? 1 : int(1, 2);
    for (let k = 0; k < count; k++) {
      const supplier = pick(suppliers);
      const date = backDate(m, int(2, 25));
      const lineCount = int(2, 5);
      const lines = Array.from({ length: lineCount }, (_, li) => {
        const it = pick(rnd() > 0.45 ? parts : products);
        return {
          id: "pol" + poSeq + "-" + li,
          itemId: it.id,
          description: it.nameAr,
          qty: it.itemType === "product" ? int(1, 4) : int(10, 40),
          unitPrice: Math.round(it.cost * (0.92 + rnd() * 0.1) * 100) / 100,
          discountPercent: 0,
          taxRate: 0, // imports invoiced without local VAT
        };
      });

      const id = "po" + ++poSeq;
      // The most recent order is still open, to give the page a live row.
      const received = !(m === 0 && k === 0);
      purchaseOrders.push({
        ...stamp(id),
        number: `${settings.purchasePrefix}-${year}-${String(poSeq).padStart(4, "0")}`,
        date,
        expectedDate: addDaysStr(date, int(20, 45)),
        supplierId: supplier.id,
        warehouseId: "w1",
        currency: "USD",
        fxRate: 1,
        status: received ? "received" : "ordered",
        discountKind: "percent",
        discountValue: 0,
        lines,
        notes: "",
        receivedAt: received ? new Date(date + "T10:00:00Z").toISOString() : null,
      });

      if (received) {
        const recvDate = addDaysStr(date, int(15, 40));
        for (const l of lines) {
          move({
            date: recvDate > dayISO(NOW) ? dayISO(NOW) : recvDate,
            itemId: l.itemId!,
            warehouseId: "w1",
            qtyDelta: l.qty,
            type: "purchase",
            refType: "purchase_order",
            refId: id,
            unitCost: l.unitPrice,
            note: `استلام ${purchaseOrders[purchaseOrders.length - 1].number}`,
          });
        }
        // Pay the supplier.
        payments.push({
          ...stamp("pay-po" + poSeq),
          date: addDaysStr(date, int(30, 60)) > dayISO(NOW) ? dayISO(NOW) : addDaysStr(date, int(30, 60)),
          direction: "out",
          partyType: "supplier",
          partyId: supplier.id,
          invoiceId: null,
          amount: Math.round(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0) * 100) / 100,
          currency: "USD",
          fxRate: 1,
          method: "bank",
          reference: "SWIFT-" + int(100000, 999999),
          note: "سداد " + purchaseOrders[purchaseOrders.length - 1].number,
        });
      }
    }
  }

  /* Sales invoices — the backbone of every chart in the app. */
  let invSeq = 0;
  const methods: PaymentMethod[] = ["cash", "bank", "cheque", "card"];

  for (let m = 11; m >= 0; m--) {
    // Gentle upward trend with noise, so the chart has a readable shape.
    const base = 4 + Math.round((11 - m) * 0.35);
    const count = Math.max(2, base + int(-1, 2));

    for (let k = 0; k < count; k++) {
      const customer = pick(customers);
      // The current month is only partly elapsed — bill within it, not past it,
      // or the dashboard opens on an empty "this month" tile.
      const lastDay = m === 0 ? Math.max(NOW.getUTCDate(), 1) : 28;
      const date = backDate(m, int(1, lastDay));
      if (date > dayISO(NOW)) continue;

      const id = "inv" + ++invSeq;
      const lineCount = int(1, 4);
      const lines = Array.from({ length: lineCount }, (_, li) => {
        const it = pick(rnd() > 0.55 ? products : parts);
        return {
          id: "il" + invSeq + "-" + li,
          itemId: it.id,
          description: it.nameAr,
          qty: it.itemType === "product" ? int(1, 2) : int(1, 8),
          unitPrice: it.price,
          discountPercent: rnd() > 0.75 ? pick([5, 10]) : 0,
          taxRate: settings.defaultTaxRate,
        };
      });

      // A few invoices are billed in Turkish lira — the multi-currency path
      // needs real rows exercising it, not just a settings screen.
      const useTRY = rnd() > 0.82;
      const currency = useTRY ? ("TRY" as const) : ("USD" as const);
      const fxRate = useTRY ? 0.029 : 1;
      if (useTRY) {
        for (const l of lines) l.unitPrice = Math.round(l.unitPrice / fxRate);
      }

      const gross = lines.reduce(
        (s, l) => s + l.qty * l.unitPrice * (1 - l.discountPercent / 100),
        0,
      );
      const total = gross * (1 + settings.defaultTaxRate / 100);

      // Older invoices are mostly settled; recent ones spread across states.
      let status: SalesInvoice["status"];
      const roll = rnd();
      if (m >= 3) status = roll > 0.08 ? "paid" : "partial";
      else if (m >= 1) status = roll > 0.55 ? "paid" : roll > 0.25 ? "partial" : "issued";
      else status = roll > 0.7 ? "paid" : roll > 0.25 ? "issued" : "draft";

      const isDraft = status === "draft";

      salesInvoices.push({
        ...stamp(id),
        number: `${settings.invoicePrefix}-${year}-${String(invSeq).padStart(4, "0")}`,
        date,
        dueDate: addDaysStr(date, pick([15, 30, 30, 45, 60])),
        customerId: customer.id,
        warehouseId: rnd() > 0.75 ? "w2" : "w1",
        currency,
        fxRate,
        status,
        discountKind: "percent",
        discountValue: rnd() > 0.85 ? 5 : 0,
        lines,
        notes: "",
        issuedAt: isDraft ? null : new Date(date + "T12:00:00Z").toISOString(),
      });

      if (isDraft) continue;

      const warehouseId = salesInvoices[salesInvoices.length - 1].warehouseId;
      for (const l of lines) {
        move({
          date,
          itemId: l.itemId!,
          warehouseId,
          qtyDelta: -l.qty,
          type: "sale",
          refType: "sales_invoice",
          refId: id,
          unitCost: items.find((i) => i.id === l.itemId)!.cost,
          note: `بيع ${salesInvoices[salesInvoices.length - 1].number}`,
        });
      }

      if (status === "paid" || status === "partial") {
        const share = status === "paid" ? 1 : 0.3 + rnd() * 0.4;
        payments.push({
          ...stamp("pay-in" + invSeq),
          date: addDaysStr(date, int(2, 35)) > dayISO(NOW) ? dayISO(NOW) : addDaysStr(date, int(2, 35)),
          direction: "in",
          partyType: "customer",
          partyId: customer.id,
          invoiceId: id,
          amount: Math.round(total * share * 100) / 100,
          currency,
          fxRate,
          method: pick(methods),
          reference: "RC-" + int(10000, 99999),
          note: "",
        });
      }
    }
  }

  /* Service jobs -------------------------------------------------- */
  const faults = [
    "الكرسي لا يرتفع عند الضغط على المفتاح",
    "تسريب ماء من وحدة البصاقة",
    "الأوتوكلاف لا يصل لدرجة الحرارة المطلوبة",
    "التربين يصدر صوتاً عالياً وفقد القوة",
    "كشاف الكرسي لا يعمل",
    "جهاز التصليب لا يشحن",
    "شفط ضعيف في وحدة الشفط",
    "شاشة التحكم لا تستجيب",
    "تسريب هواء من الخرطوم الرئيسي",
  ];
  const diagnoses = [
    "تلف في موتور الرفع — يحتاج استبدال",
    "حشوة تالفة، تم الاستبدال والاختبار",
    "عنصر التسخين محترق",
    "بيرنغ التربين مستهلك",
    "لمبة LED محترقة",
    "بطارية منتهية الصلاحية",
    "فلتر مسدود، تم التنظيف",
    "كرت التحكم يحتاج إعادة برمجة",
    "",
  ];
  const statuses: ServiceStatus[] = [
    "received",
    "diagnosed",
    "awaiting_parts",
    "in_progress",
    "done",
    "delivered",
  ];

  let srvSeq = 0;
  for (let m = 6; m >= 0; m--) {
    const count = m === 0 ? int(3, 5) : int(2, 4);
    for (let k = 0; k < count; k++) {
      const date = backDate(m, int(1, 27));
      if (date > dayISO(NOW)) continue;

      const id = "srv" + ++srvSeq;
      const machine = pick(products);
      // Older jobs are closed out; this month's are spread across the board.
      const status: ServiceStatus =
        m >= 2 ? "delivered" : m === 1 ? pick(["done", "delivered", "in_progress"]) : pick(statuses);

      const consumed = status === "done" || status === "delivered" || status === "in_progress";
      const partCount = rnd() > 0.3 ? int(1, 3) : 0;
      const jobParts = Array.from({ length: partCount }, (_, pi) => {
        const p = pick(parts);
        return {
          id: "sp" + srvSeq + "-" + pi,
          itemId: p.id,
          qty: int(1, 3),
          unitPrice: p.price,
          warehouseId: "w3",
          consumed,
        };
      });

      const underWarranty = rnd() > 0.72;

      serviceJobs.push({
        ...stamp(id),
        number: `${settings.servicePrefix}-${year}-${String(srvSeq).padStart(4, "0")}`,
        date,
        customerId: pick(customers).id,
        machineItemId: machine.id,
        machineLabel: machine.nameAr,
        serialNo: machine.model.replace(/\s/g, "") + "-" + int(10000, 99999),
        reportedFault: pick(faults),
        diagnosis: status === "received" ? "" : pick(diagnoses),
        status,
        technicianId: pick(["u4", "u5"]),
        laborCharge: underWarranty ? 0 : pick([40, 60, 80, 120, 150]),
        underWarranty,
        parts: jobParts,
        notes: "",
        closedAt:
          status === "delivered" ? new Date(addDaysStr(date, int(2, 12)) + "T15:00:00Z").toISOString() : null,
      });

      if (consumed) {
        for (const p of jobParts) {
          move({
            date: addDaysStr(date, int(0, 4)) > dayISO(NOW) ? dayISO(NOW) : addDaysStr(date, int(0, 4)),
            itemId: p.itemId,
            warehouseId: p.warehouseId,
            qtyDelta: -p.qty,
            type: "service",
            refType: "service_job",
            refId: id,
            unitCost: items.find((i) => i.id === p.itemId)!.cost,
            note: `صيانة ${serviceJobs[serviceJobs.length - 1].number}`,
          });
        }
      }
    }
  }

  /* Expenses ------------------------------------------------------ */
  const expenseCats: [ExpenseCategory, number, number, string][] = [
    ["rent", 1200, 1200, "إيجار المكتب والمستودع"],
    ["salaries", 4200, 5600, "رواتب الفريق"],
    ["utilities", 180, 340, "كهرباء وماء وإنترنت"],
    ["shipping", 240, 900, "شحن وتخليص جمركي"],
    ["marketing", 0, 600, "إعلانات ومعارض"],
    ["maintenance", 0, 380, "صيانة المركبات والمعدات"],
  ];
  let expSeq = 0;
  for (let m = 11; m >= 0; m--) {
    for (const [cat, lo, hi, desc] of expenseCats) {
      if (hi === 0) continue;
      if (lo === 0 && rnd() > 0.5) continue;
      const date = backDate(m, int(1, 27));
      if (date > dayISO(NOW)) continue;
      expenses.push({
        ...stamp("ex" + ++expSeq),
        date,
        category: cat,
        amount: lo === hi ? lo : int(lo || 50, hi),
        currency: "USD",
        fxRate: 1,
        method: cat === "salaries" || cat === "rent" ? "bank" : pick(methods),
        description: desc,
      });
    }
  }

  /*
   * Stock counts. Applied last, once every sale and receipt is on the ledger,
   * so a handful of lines end up at or under their reorder point. Without this
   * the low-stock panel and the reorder report open empty and nobody can tell
   * whether they work.
   */
  const countDate = addDaysStr(dayISO(NOW), -int(1, 5));
  const scarce = [items[2], items[7], items[12], items[18], items[21], items[25], items[28]];
  for (const [n, it] of scarce.entries()) {
    if (!it) continue;
    const total = stockMoves
      .filter((mv) => mv.itemId === it.id)
      .reduce((s, mv) => s + mv.qtyDelta, 0);
    const inMain = stockMoves
      .filter((mv) => mv.itemId === it.id && mv.warehouseId === "w1")
      .reduce((s, mv) => s + mv.qtyDelta, 0);

    // Every third one goes fully out of stock; the rest land just under the line.
    const target = n % 3 === 0 ? 0 : Math.max(0, Math.floor(it.minStock * 0.6));
    const delta = target - total;
    if (delta >= 0 || inMain + delta < 0) continue;

    move({
      date: countDate,
      itemId: it.id,
      warehouseId: "w1",
      qtyDelta: delta,
      type: "adjustment",
      refType: "manual",
      refId: null,
      unitCost: it.cost,
      note: "تسوية جرد — فرق عد",
    });
  }

  stockMoves.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    settings,
    users,
    categories,
    items,
    warehouses,
    stockMoves,
    customers,
    suppliers,
    salesInvoices,
    purchaseOrders,
    payments,
    expenses,
    serviceJobs,
  };
}
