/**
 * Validate an import and, if it is clean, say exactly what it would write.
 *
 * Pure: it reads a database snapshot and returns row-by-row results plus an
 * `apply` function. The preview calls it and throws `apply` away; the real
 * import calls it again inside the write transaction, on the data as it is
 * under the lock, and only applies when every row passed. A file with one bad
 * row writes nothing, so a fixed file can be re-uploaded without duplicating
 * the rows that were fine.
 */

import type { Customer, Database, Item, ItemType, StockMove, Supplier } from "@/lib/data/types";
import { PARTY_KINDS, UNITS } from "@/lib/labels";
import { COLUMNS, type ImportKind } from "./kinds";

export type ErrorCode =
  | "required"
  | "duplicateInFile"
  | "exists"
  | "badNumber"
  | "negative"
  | "badUnit"
  | "badCategory"
  | "badBool"
  | "badKind"
  | "badEmail"
  | "badDate"
  | "unknownSku"
  | "unknownWarehouse"
  | "taxRange"
  | "qtyPositive"
  | "wholeNumber";

export interface RowError {
  field: string;
  code: ErrorCode;
}

export interface RowResult {
  /** 1-based position among the data rows (the header is not counted). */
  line: number;
  /** What the row is about, to recognise it in the list: SKU or name. */
  label: string;
  errors: RowError[];
}

export interface Plan {
  results: RowResult[];
  /** True when no row has an error. */
  ok: boolean;
  /** Rows that would be written. */
  count: number;
  apply: (db: Database, h: { id: () => string; now: () => string }) => void;
}

type Rec = Record<string, string>;

/* ---- value parsing --------------------------------------------------- */

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** "1.234,50", "1,234.50", "12,5", "٣٠" → a number; anything else → null. */
export function parseNumber(raw: string): number | null {
  let s = raw.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d))).replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) {
    // Both present: whichever comes last is the decimal mark, the other groups thousands.
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) s = s.replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const YES = new Set(["yes", "y", "true", "1", "نعم", "evet"]);
const NO = new Set(["no", "n", "false", "0", "لا", "hayır", "hayir", ""]);

function parseBool(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (YES.has(s)) return true;
  if (NO.has(s)) return false;
  return null;
}

export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let y: string, m: string, d: string;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (hit) [, y, m, d] = hit;
  else if ((hit = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s))) [, d, m, y] = hit;
  else return null;
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const check = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== iso ? null : iso;
}

const lower = (s: string) => s.trim().toLowerCase();

/* ---- the planner ------------------------------------------------------ */

export function planImport(kind: ImportKind, records: Rec[], db: Database, today: string): Plan {
  switch (kind) {
    case "products":
      return planItems("product", records, db);
    case "spare_parts":
      return planItems("spare_part", records, db);
    case "customers":
      return planParties("customers", records, db);
    case "suppliers":
      return planParties("suppliers", records, db);
    case "opening_stock":
      return planStock(records, db, today);
  }
}

/** Shared reading of optional number cells. */
function numberCell(rec: Rec, field: string, errors: RowError[], fallback: number, opts: { max?: number } = {}): number {
  const raw = rec[field] ?? "";
  if (raw === "") return fallback;
  const n = parseNumber(raw);
  if (n === null) {
    errors.push({ field, code: "badNumber" });
    return fallback;
  }
  if (n < 0) {
    errors.push({ field, code: "negative" });
    return fallback;
  }
  if (opts.max !== undefined && n > opts.max) errors.push({ field, code: "taxRange" });
  return n;
}

function finish(results: RowResult[], count: number, apply: Plan["apply"]): Plan {
  return { results, ok: results.every((r) => r.errors.length === 0), count, apply };
}

function planItems(itemType: ItemType, records: Rec[], db: Database): Plan {
  const results: RowResult[] = [];
  const taken = new Set(db.items.map((i) => lower(i.sku)));
  const rows: Array<Omit<Item, "id" | "createdAt" | "updatedAt">> = [];
  const categories = db.categories.filter((c) => c.appliesTo === "both" || c.appliesTo === itemType);

  records.forEach((rec, i) => {
    const errors: RowError[] = [];
    const sku = rec.sku ?? "";
    const nameAr = rec.nameAr ?? "";
    if (!sku) errors.push({ field: "sku", code: "required" });
    else if (taken.has(lower(sku))) {
      // Present before this file, or earlier in the same file.
      const inFile = rows.some((r) => lower(r.sku) === lower(sku));
      errors.push({ field: "sku", code: inFile ? "duplicateInFile" : "exists" });
    }
    if (!nameAr) errors.push({ field: "nameAr", code: "required" });

    let unit: Item["unit"] = "piece";
    if (rec.unit) {
      const found = UNITS.find((u) => u === lower(rec.unit));
      if (found) unit = found;
      else errors.push({ field: "unit", code: "badUnit" });
    }

    let categoryId: string | null = null;
    if (rec.category) {
      const q = lower(rec.category);
      const hit = categories.find((c) => lower(c.nameAr) === q || (c.nameTr && lower(c.nameTr) === q));
      if (hit) categoryId = hit.id;
      else errors.push({ field: "category", code: "badCategory" });
    }

    const cost = numberCell(rec, "cost", errors, 0);
    const price = numberCell(rec, "price", errors, 0);
    const taxRate = numberCell(rec, "taxRate", errors, db.settings.defaultTaxRate, { max: 100 });
    const minStock = numberCell(rec, "minStock", errors, db.settings.lowStockDefault);

    let tracksSerial = false;
    let warrantyMonths = 0;
    if (itemType === "product") {
      const flag = parseBool(rec.tracksSerial ?? "");
      if (flag === null) errors.push({ field: "tracksSerial", code: "badBool" });
      else tracksSerial = flag;
      warrantyMonths = numberCell(rec, "warrantyMonths", errors, 0);
      if (!Number.isInteger(warrantyMonths)) errors.push({ field: "warrantyMonths", code: "wholeNumber" });
    }

    if (sku) taken.add(lower(sku));
    results.push({ line: i + 1, label: sku || nameAr, errors });
    rows.push({
      sku,
      nameAr,
      nameTr: rec.nameTr ?? "",
      itemType,
      categoryId,
      unit,
      cost,
      price,
      taxRate,
      minStock,
      brand: rec.brand ?? "",
      model: rec.model ?? "",
      barcode: rec.barcode ?? "",
      fitsItemIds: [],
      notes: rec.notes ?? "",
      active: true,
      ...(itemType === "product" ? { tracksSerial, warrantyMonths } : {}),
    });
  });

  return finish(results, rows.length, (target, h) => {
    const ts = h.now();
    for (const row of rows) target.items.push({ ...row, id: h.id(), createdAt: ts, updatedAt: ts });
  });
}

function planParties(which: "customers" | "suppliers", records: Rec[], db: Database): Plan {
  const results: RowResult[] = [];
  const existing = db[which] as Array<Customer | Supplier>;
  const prefix = which === "customers" ? "C-" : "S-";
  const usedCodes = new Set(existing.map((p) => lower(p.code)));
  const usedNames = new Set(existing.map((p) => lower(p.name)));
  const fileCodes = new Set<string>();
  const fileNames = new Set<string>();

  // New numbers continue the series the screen suggests: highest so far, else 1000 / 2000.
  let highest = existing
    .map((p) => Number.parseInt(p.code.replace(prefix, ""), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), which === "customers" ? 1000 : 2000);
  for (const rec of records) {
    const n = Number.parseInt((rec.code ?? "").replace(prefix, ""), 10);
    if (Number.isFinite(n)) highest = Math.max(highest, n);
  }

  type Row = Omit<Customer, "id" | "createdAt" | "updatedAt">;
  const rows: Row[] = [];

  records.forEach((rec, i) => {
    const errors: RowError[] = [];
    const name = rec.name ?? "";
    if (!name) errors.push({ field: "name", code: "required" });
    else if (usedNames.has(lower(name))) errors.push({ field: "name", code: "exists" });
    else if (fileNames.has(lower(name))) errors.push({ field: "name", code: "duplicateInFile" });

    let code = rec.code ?? "";
    if (code) {
      if (usedCodes.has(lower(code))) errors.push({ field: "code", code: "exists" });
      else if (fileCodes.has(lower(code))) errors.push({ field: "code", code: "duplicateInFile" });
    } else {
      code = prefix + ++highest;
    }

    let kind: Row["kind"] = which === "suppliers" ? "dealer" : "clinic";
    if (rec.kind) {
      const found = PARTY_KINDS.find((k) => k === lower(rec.kind));
      if (found) kind = found;
      else errors.push({ field: "kind", code: "badKind" });
    }

    const email = rec.email ?? "";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push({ field: "email", code: "badEmail" });
    const creditLimit = numberCell(rec, "creditLimit", errors, 0);

    if (name) fileNames.add(lower(name));
    fileCodes.add(lower(code));
    results.push({ line: i + 1, label: name || code, errors });
    rows.push({
      code,
      name,
      kind,
      contactPerson: rec.contactPerson ?? "",
      phone: rec.phone ?? "",
      email,
      address: rec.address ?? "",
      city: rec.city ?? "",
      taxNumber: rec.taxNumber ?? "",
      creditLimit,
      notes: rec.notes ?? "",
      active: true,
    });
  });

  return finish(results, rows.length, (target, h) => {
    const ts = h.now();
    for (const row of rows) {
      (target[which] as Array<Customer | Supplier>).push({ ...row, id: h.id(), createdAt: ts, updatedAt: ts });
    }
  });
}

function planStock(records: Rec[], db: Database, today: string): Plan {
  const results: RowResult[] = [];
  const bySku = new Map(db.items.map((i) => [lower(i.sku), i]));
  const defaultWarehouse = db.warehouses.find((w) => w.isDefault) ?? db.warehouses[0];
  const moves: Array<Omit<StockMove, "id" | "createdAt" | "updatedAt">> = [];

  records.forEach((rec, i) => {
    const errors: RowError[] = [];
    const sku = rec.sku ?? "";
    const item = sku ? bySku.get(lower(sku)) : undefined;
    if (!sku) errors.push({ field: "sku", code: "required" });
    else if (!item) errors.push({ field: "sku", code: "unknownSku" });

    let qty = 0;
    if (!rec.qty) errors.push({ field: "qty", code: "required" });
    else {
      const n = parseNumber(rec.qty);
      if (n === null) errors.push({ field: "qty", code: "badNumber" });
      else if (n <= 0) errors.push({ field: "qty", code: "qtyPositive" });
      else qty = n;
    }

    let warehouseId = defaultWarehouse?.id ?? "";
    if (rec.warehouse) {
      const q = lower(rec.warehouse);
      const hit = db.warehouses.find((w) => lower(w.nameAr) === q || (w.nameTr && lower(w.nameTr) === q));
      if (hit) warehouseId = hit.id;
      else errors.push({ field: "warehouse", code: "unknownWarehouse" });
    }

    const unitCost = numberCell(rec, "unitCost", errors, item?.cost ?? 0);

    let date = today;
    if (rec.date) {
      const parsed = parseDate(rec.date);
      if (parsed) date = parsed;
      else errors.push({ field: "date", code: "badDate" });
    }

    results.push({ line: i + 1, label: sku, errors });
    if (item) {
      moves.push({
        date,
        itemId: item.id,
        warehouseId,
        qtyDelta: qty,
        type: "opening",
        refType: "manual",
        refId: null,
        unitCost,
        note: "import",
      });
    }
  });

  return finish(results, moves.length, (target, h) => {
    const ts = h.now();
    for (const move of moves) target.stockMoves.push({ ...move, id: h.id(), createdAt: ts, updatedAt: ts });
  });
}

/** Column keys for a kind, for the UI to name an error's field. */
export function columnKeys(kind: ImportKind): string[] {
  return COLUMNS[kind].map((c) => c.key);
}

