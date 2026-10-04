/**
 * What each server action accepts, field by field. See `validate.ts` for why.
 *
 * Fields the server owns are never read from the browser: `id`, `number`,
 * `status` transitions, `issuedAt`, `closedAt`, `consumed`, `receivedQty`,
 * `serials`, `createdAt`, `updatedAt`. They are set by the action that is
 * allowed to change them.
 */

import type {
  BillingRegion,
  Category,
  CurrencyCode,
  Database,
  DispatchInfo,
  DocumentLine,
  Expense,
  InvoiceDocumentType,
  Item,
  Party,
  Payment,
  Role,
  ServiceJob,
  ServicePart,
  ServiceStatus,
  Settings,
  SyriaTaxProfile,
  TurkeyTaxProfile,
  User,
  Warehouse,
} from "@/lib/data/types";
import { arr, bool, date, nullableRef, num, obj, oneOf, optional, ref, str, type Obj } from "./validate";

export const CURRENCIES: readonly CurrencyCode[] = ["USD", "TRY", "SAR", "AED", "EUR", "SYP"];
const REGIONS: readonly BillingRegion[] = ["TR", "SY"];
const DOC_TYPES: readonly InvoiceDocumentType[] = ["fatura", "e_fatura", "e_arsiv", "e_irsaliye", "export"];
export const METHODS = ["cash", "bank", "cheque", "card"] as const;
export const SERVICE_STATUSES: readonly ServiceStatus[] = [
  "received",
  "diagnosed",
  "awaiting_parts",
  "in_progress",
  "done",
  "delivered",
];
const ROLES_ALL: readonly Role[] = ["owner", "accountant", "sales", "technician", "service_lead", "viewer"];
const EXPENSE_CATEGORIES = ["rent", "salaries", "utilities", "shipping", "marketing", "maintenance", "other"] as const;

const MONEY_MAX = 1e12;
const QTY_MAX = 1e9;

const text = (o: Obj, key: string, max = 500) => str(o[key] ?? "", key, max);
const percent = (x: unknown, field: string) => num(x ?? 0, field, { min: 0, max: 100 });

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

function documentLine(x: unknown): DocumentLine {
  const o = obj(x, "line");
  return {
    id: str(o.id, "line.id", 100),
    itemId: nullableRef(o.itemId, "line.itemId"),
    description: text(o, "description", 1000),
    // Zero is let through here so the action can answer "required field";
    // negative, NaN and Infinity never are.
    qty: num(o.qty, "qty", { max: QTY_MAX }),
    unitPrice: num(o.unitPrice, "unitPrice", { max: MONEY_MAX }),
    discountPercent: percent(o.discountPercent, "discountPercent"),
    taxRate: percent(o.taxRate, "taxRate"),
  };
}

function documentLines(x: unknown): DocumentLine[] {
  const lines = arr(x, "lines", 500, documentLine);
  if (new Set(lines.map((l) => l.id)).size !== lines.length) obj(null, "lines.id");
  return lines;
}

function dispatchInfo(x: unknown): DispatchInfo {
  const o = obj(x, "dispatch");
  return {
    vehiclePlate: text(o, "vehiclePlate", 30),
    driverName: text(o, "driverName", 200),
    driverTckn: text(o, "driverTckn", 30),
    carrierName: text(o, "carrierName", 200),
    carrierTaxId: text(o, "carrierTaxId", 30),
    dispatchedAt: text(o, "dispatchedAt", 40),
    deliveryAddress: text(o, "deliveryAddress", 1000),
  };
}

/** The part of a document the browser may set; shared by invoices and orders. */
function documentCommon(o: Obj) {
  const discountKind = oneOf(o.discountKind, "discountKind", ["percent", "amount"] as const);
  return {
    date: date(o.date, "date"),
    warehouseId: ref(o.warehouseId, "warehouseId"),
    currency: oneOf(o.currency, "currency", CURRENCIES),
    fxRate: num(o.fxRate, "fxRate", { gt: 0, max: 1e9 }),
    discountKind,
    discountValue: num(o.discountValue ?? 0, "discountValue", { max: discountKind === "percent" ? 100 : MONEY_MAX }),
    lines: documentLines(o.lines),
    notes: text(o, "notes", 5000),
  };
}

export function invoiceInput(x: unknown) {
  const o = obj(x, "invoice");
  return {
    ...documentCommon(o),
    dueDate: date(o.dueDate, "dueDate"),
    customerId: ref(o.customerId, "customerId"),
    ...optional(o, "billingRegion", (v) => oneOf(v, "billingRegion", REGIONS)),
    ...optional(o, "documentType", (v) => oneOf(v, "documentType", DOC_TYPES)),
    ...optional(o, "dispatch", dispatchInfo),
    ...optional(o, "localCurrency", (v) => oneOf(v, "localCurrency", CURRENCIES)),
    ...optional(o, "localRate", (v) => num(v, "localRate", { gt: 0, max: 1e9 })),
  };
}

export function orderInput(x: unknown) {
  const o = obj(x, "order");
  return {
    ...documentCommon(o),
    expectedDate: date(o.expectedDate, "expectedDate"),
    supplierId: ref(o.supplierId, "supplierId"),
    // The browser may keep an order a draft or mark it ordered. Received,
    // partial and cancelled are reached only through their own actions.
    status: oneOf(o.status ?? "draft", "status", ["draft", "ordered"] as const),
  };
}

export function billingInput(x: unknown) {
  const o = obj(x, "billing");
  return {
    billingRegion: oneOf(o.billingRegion, "billingRegion", REGIONS),
    documentType: oneOf(o.documentType, "documentType", DOC_TYPES),
    ...optional(o, "dispatch", dispatchInfo),
    ...optional(o, "localCurrency", (v) => oneOf(v, "localCurrency", CURRENCIES)),
    ...optional(o, "localRate", (v) => num(v, "localRate", { gt: 0, max: 1e9 })),
  };
}

export function serialsInput(x: unknown): Record<string, string[]> {
  const o = obj(x ?? {}, "serials");
  const out: Record<string, string[]> = {};
  for (const [lineId, list] of Object.entries(o)) {
    if (lineId.length > 100) obj(null, "serials");
    out[lineId] = arr(list, "serials", 5000, (s) => str(s, "serial", 100));
  }
  return out;
}

/** Quantities for a partial receipt: line id → how much arrived. */
export function quantitiesInput(x: unknown): Record<string, number> | undefined {
  if (x === undefined || x === null) return undefined;
  const o = obj(x, "quantities");
  const out: Record<string, number> = {};
  for (const [lineId, q] of Object.entries(o)) out[lineId.slice(0, 100)] = num(q, "quantity", { max: QTY_MAX });
  return out;
}

/** Do the warehouse, the party and every item a document names actually exist? */
export function documentRefsExist(
  db: Database,
  d: { warehouseId: string; lines: DocumentLine[] },
  parties: Party[],
  partyId: string,
): boolean {
  if (!db.warehouses.some((w) => w.id === d.warehouseId)) return false;
  if (!parties.some((p) => p.id === partyId)) return false;
  const items = new Set(db.items.map((i) => i.id));
  return d.lines.every((l) => !l.itemId || items.has(l.itemId));
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

export function paymentInput(x: unknown): Omit<Payment, "id" | "createdAt" | "updatedAt"> {
  const o = obj(x, "payment");
  return {
    date: date(o.date, "date"),
    direction: oneOf(o.direction, "direction", ["in", "out"] as const),
    partyType: oneOf(o.partyType, "partyType", ["customer", "supplier"] as const),
    partyId: ref(o.partyId, "partyId"),
    invoiceId: nullableRef(o.invoiceId, "invoiceId"),
    amount: num(o.amount, "amount", { max: MONEY_MAX }),
    currency: oneOf(o.currency, "currency", CURRENCIES),
    fxRate: num(o.fxRate, "fxRate", { gt: 0, max: 1e9 }),
    method: oneOf(o.method, "method", METHODS),
    reference: text(o, "reference", 200),
    note: text(o, "note", 2000),
  };
}

export function invoicePaymentInput(x: unknown) {
  const o = obj(x, "payment");
  return {
    invoiceId: str(o.invoiceId, "invoiceId", 100),
    date: date(o.date, "date"),
    amount: num(o.amount, "amount", { max: MONEY_MAX }),
    method: oneOf(o.method, "method", METHODS),
    reference: text(o, "reference", 200),
    note: text(o, "note", 2000),
  };
}

export function expenseInput(x: unknown): Omit<Expense, "id" | "createdAt" | "updatedAt"> {
  const o = obj(x, "expense");
  return {
    date: date(o.date, "date"),
    category: oneOf(o.category, "category", EXPENSE_CATEGORIES),
    amount: num(o.amount, "amount", { max: MONEY_MAX }),
    currency: oneOf(o.currency, "currency", CURRENCIES),
    fxRate: num(o.fxRate, "fxRate", { gt: 0, max: 1e9 }),
    method: oneOf(o.method, "method", METHODS),
    description: text(o, "description", 1000),
  };
}

/* ------------------------------------------------------------------ */
/* Stock                                                               */
/* ------------------------------------------------------------------ */

export function adjustInput(x: unknown) {
  const o = obj(x, "adjustment");
  return {
    itemId: ref(o.itemId, "itemId"),
    warehouseId: ref(o.warehouseId, "warehouseId"),
    qtyDelta: num(o.qtyDelta, "qtyDelta", { min: -QTY_MAX, max: QTY_MAX }),
    date: date(o.date, "date"),
    note: text(o, "note", 1000),
  };
}

export function transferInput(x: unknown) {
  const o = obj(x, "transfer");
  return {
    itemId: ref(o.itemId, "itemId"),
    fromWarehouseId: ref(o.fromWarehouseId, "fromWarehouseId"),
    toWarehouseId: ref(o.toWarehouseId, "toWarehouseId"),
    qty: num(o.qty, "qty", { max: QTY_MAX }),
    date: date(o.date, "date"),
    note: text(o, "note", 1000),
  };
}

export function warehouseInput(x: unknown): Omit<Warehouse, "id" | "createdAt" | "updatedAt"> {
  const o = obj(x, "warehouse");
  return {
    nameAr: text(o, "nameAr", 200),
    nameTr: text(o, "nameTr", 200),
    location: text(o, "location", 500),
    isDefault: bool(o.isDefault ?? false, "isDefault"),
    active: bool(o.active ?? true, "active"),
  };
}

/* ------------------------------------------------------------------ */
/* Catalog and parties                                                 */
/* ------------------------------------------------------------------ */

export function categoryInput(x: unknown): Omit<Category, "id" | "createdAt" | "updatedAt"> {
  const o = obj(x, "category");
  return {
    nameAr: text(o, "nameAr", 200),
    nameTr: text(o, "nameTr", 200),
    parentId: nullableRef(o.parentId, "parentId"),
    appliesTo: oneOf(o.appliesTo, "appliesTo", ["product", "spare_part", "both"] as const),
    sortOrder: num(o.sortOrder ?? 0, "sortOrder", { min: -1e6, max: 1e6 }),
  };
}

export function itemInput(x: unknown): Omit<Item, "id" | "createdAt" | "updatedAt"> {
  const o = obj(x, "item");
  return {
    sku: text(o, "sku", 100),
    nameAr: text(o, "nameAr", 300),
    nameTr: text(o, "nameTr", 300),
    itemType: oneOf(o.itemType, "itemType", ["product", "spare_part"] as const),
    categoryId: nullableRef(o.categoryId, "categoryId"),
    unit: oneOf(o.unit, "unit", ["piece", "box", "set", "meter", "kg", "liter"] as const),
    cost: num(o.cost, "cost", { max: MONEY_MAX }),
    price: num(o.price, "price", { max: MONEY_MAX }),
    taxRate: percent(o.taxRate, "taxRate"),
    minStock: num(o.minStock ?? 0, "minStock", { max: QTY_MAX }),
    brand: text(o, "brand", 200),
    model: text(o, "model", 200),
    barcode: text(o, "barcode", 100),
    fitsItemIds: arr(o.fitsItemIds ?? [], "fitsItemIds", 1000, (v) => str(v, "fitsItemIds", 100)),
    notes: text(o, "notes", 5000),
    active: bool(o.active ?? true, "active"),
    ...optional(o, "tracksSerial", (v) => bool(v, "tracksSerial")),
    ...optional(o, "warrantyMonths", (v) => num(v, "warrantyMonths", { max: 600, int: true })),
  };
}

function turkeyProfile(x: unknown): TurkeyTaxProfile {
  const o = obj(x, "turkey");
  return {
    taxIdKind: oneOf(o.taxIdKind ?? "vkn", "taxIdKind", ["vkn", "tckn"] as const),
    taxId: text(o, "taxId", 30),
    taxOffice: text(o, "taxOffice", 200),
    tradeRegistryNo: text(o, "tradeRegistryNo", 100),
    gibAlias: text(o, "gibAlias", 200),
    eInvoiceUser: bool(o.eInvoiceUser ?? false, "eInvoiceUser"),
    mersisNo: text(o, "mersisNo", 100),
  };
}

function syriaProfile(x: unknown): SyriaTaxProfile {
  const o = obj(x, "syria");
  return {
    commercialRegisterNo: text(o, "commercialRegisterNo", 100),
    importLicenseNo: text(o, "importLicenseNo", 100),
    customsOffice: text(o, "customsOffice", 200),
    exemptionNote: text(o, "exemptionNote", 1000),
  };
}

export function partyInput(x: unknown): Omit<Party, "id" | "createdAt" | "updatedAt"> {
  const o = obj(x, "party");
  return {
    code: text(o, "code", 100),
    name: text(o, "name", 300),
    kind: oneOf(o.kind, "kind", ["clinic", "hospital", "lab", "dealer", "other"] as const),
    contactPerson: text(o, "contactPerson", 200),
    phone: text(o, "phone", 100),
    email: text(o, "email", 200),
    address: text(o, "address", 1000),
    city: text(o, "city", 200),
    taxNumber: text(o, "taxNumber", 100),
    creditLimit: num(o.creditLimit ?? 0, "creditLimit", { max: MONEY_MAX }),
    notes: text(o, "notes", 5000),
    active: bool(o.active ?? true, "active"),
    ...optional(o, "billingRegion", (v) => oneOf(v, "billingRegion", REGIONS)),
    ...optional(o, "turkey", turkeyProfile),
    ...optional(o, "syria", syriaProfile),
  };
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

/** `consumed` is deliberately absent: only `consumeParts` may set it. */
export type PartInput = Omit<ServicePart, "consumed">;

function servicePart(x: unknown): PartInput {
  const o = obj(x, "part");
  return {
    id: str(o.id, "part.id", 100),
    itemId: ref(o.itemId, "part.itemId"),
    qty: num(o.qty, "part.qty", { max: QTY_MAX }),
    unitPrice: num(o.unitPrice ?? 0, "part.unitPrice", { max: MONEY_MAX }),
    warehouseId: ref(o.warehouseId, "part.warehouseId"),
  };
}

export type JobFields = Omit<ServiceJob, "id" | "createdAt" | "updatedAt" | "number" | "closedAt" | "invoiceId" | "parts">;

export function jobInput(x: unknown): { fields: JobFields; parts: PartInput[] } {
  const o = obj(x, "job");
  const parts = arr(o.parts ?? [], "parts", 200, servicePart);
  if (new Set(parts.map((p) => p.id)).size !== parts.length) obj(null, "parts.id");
  return {
    fields: {
      date: date(o.date, "date"),
      customerId: ref(o.customerId, "customerId"),
      machineItemId: nullableRef(o.machineItemId, "machineItemId"),
      machineLabel: text(o, "machineLabel", 300),
      serialNo: text(o, "serialNo", 100),
      reportedFault: text(o, "reportedFault", 5000),
      diagnosis: text(o, "diagnosis", 5000),
      status: oneOf(o.status, "status", SERVICE_STATUSES),
      technicianId: nullableRef(o.technicianId, "technicianId"),
      laborCharge: num(o.laborCharge ?? 0, "laborCharge", { max: MONEY_MAX }),
      underWarranty: bool(o.underWarranty ?? false, "underWarranty"),
      notes: text(o, "notes", 5000),
      ...optional(o, "unitId", (v) => str(v, "unitId", 100)),
    },
    parts,
  };
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export function userInput(x: unknown): Omit<User, "id" | "createdAt" | "updatedAt"> {
  const o = obj(x, "user");
  return {
    name: text(o, "name", 200),
    email: text(o, "email", 200),
    phone: text(o, "phone", 100),
    role: oneOf(o.role, "role", ROLES_ALL),
    active: bool(o.active, "active"),
  };
}

/** A settings patch: only the keys the form owns, each checked. `updatedAt` is never read. */
export function settingsPatch(x: unknown): Partial<Settings> {
  const o = obj(x, "settings");
  const s = (key: keyof Settings, max = 500) => optional(o, key as string, (v) => str(v, key, max));
  return {
    ...s("companyName", 300),
    ...s("companyNameTr", 300),
    ...s("address", 1000),
    ...s("phone", 100),
    ...s("email", 200),
    ...s("taxNumber", 100),
    ...optional(o, "baseCurrency", (v) => oneOf(v, "baseCurrency", CURRENCIES)),
    ...optional(o, "currencies", (v) =>
      arr(v, "currencies", 20, (c) => {
        const r = obj(c, "currency");
        return { code: oneOf(r.code, "currency.code", CURRENCIES), rate: num(r.rate, "currency.rate", { gt: 0, max: 1e9 }) };
      }),
    ),
    ...optional(o, "defaultTaxRate", (v) => num(v, "defaultTaxRate", { max: 100 })),
    ...optional(o, "lowStockDefault", (v) => num(v, "lowStockDefault", { max: QTY_MAX })),
    ...s("invoicePrefix", 20),
    ...s("purchasePrefix", 20),
    ...s("servicePrefix", 20),
    ...s("bankName", 200),
    ...s("bankAccountName", 200),
    ...s("iban", 100),
    ...s("swift", 50),
    ...s("warrantyTerms", 5000),
    ...s("taxOffice", 200),
    ...s("tradeRegistryNo", 100),
    ...s("mersisNo", 100),
  } as Partial<Settings>;
}
