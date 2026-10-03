/**
 * How each collection in `types.ts` maps onto the `erp` schema.
 *
 * Column names are the field names in snake_case, so a spec lists fields,
 * not columns. Only what differs from "a scalar copied as-is" is declared:
 *
 *   json      — stored as jsonb (nested objects)
 *   optional  — declared `field?:` in types.ts; a NULL column reads back as
 *               an absent key, not `null`, so `"x" in row` stays meaningful
 *   children  — an array of sub-records stored in its own table, ordered by
 *               `position`, keyed back to the parent
 *
 * A field missing from this list is a field the database will not store, so
 * adding one to `types.ts` without adding it here is a silent data loss;
 * `scripts/check-schema.ts` compares the two.
 */

import type { CollectionName } from "./types";

export interface ChildSpec {
  /** Property on the parent holding the array — `lines`, `parts`. */
  prop: string;
  table: string;
  /** Column pointing back at the parent. */
  parentKey: string;
  fields: string[];
}

export interface TableSpec {
  table: string;
  fields: string[];
  json?: string[];
  optional?: string[];
  children?: ChildSpec;
}

const BASE = ["id", "createdAt", "updatedAt"];

const PARTY: TableSpec["fields"] = [
  ...BASE,
  "code",
  "name",
  "kind",
  "contactPerson",
  "phone",
  "email",
  "address",
  "city",
  "taxNumber",
  "creditLimit",
  "notes",
  "active",
  "billingRegion",
  "turkey",
  "syria",
];

const DOC_LINE = [
  "id",
  "itemId",
  "description",
  "qty",
  "unitPrice",
  "discountPercent",
  "taxRate",
];

export const SPECS: Record<CollectionName, TableSpec> = {
  users: {
    table: "users",
    fields: [...BASE, "name", "email", "phone", "role", "active"],
  },
  categories: {
    table: "categories",
    fields: [...BASE, "nameAr", "nameTr", "parentId", "appliesTo", "sortOrder"],
  },
  items: {
    table: "items",
    fields: [
      ...BASE,
      "sku",
      "nameAr",
      "nameTr",
      "itemType",
      "categoryId",
      "unit",
      "cost",
      "price",
      "taxRate",
      "minStock",
      "brand",
      "model",
      "barcode",
      "fitsItemIds",
      "notes",
      "active",
    ],
  },
  warehouses: {
    table: "warehouses",
    fields: [...BASE, "nameAr", "nameTr", "location", "isDefault", "active"],
  },
  stockMoves: {
    table: "stock_moves",
    fields: [
      ...BASE,
      "date",
      "itemId",
      "warehouseId",
      "qtyDelta",
      "type",
      "refType",
      "refId",
      "unitCost",
      "note",
    ],
  },
  customers: {
    table: "customers",
    fields: PARTY,
    json: ["turkey", "syria"],
    optional: ["billingRegion", "turkey", "syria"],
  },
  suppliers: {
    table: "suppliers",
    fields: PARTY,
    json: ["turkey", "syria"],
    optional: ["billingRegion", "turkey", "syria"],
  },
  salesInvoices: {
    table: "sales_invoices",
    fields: [
      ...BASE,
      "number",
      "date",
      "dueDate",
      "customerId",
      "warehouseId",
      "currency",
      "fxRate",
      "status",
      "discountKind",
      "discountValue",
      "notes",
      "issuedAt",
      "billingRegion",
      "documentType",
      "dispatch",
      "localRate",
      "localCurrency",
    ],
    json: ["dispatch"],
    optional: ["billingRegion", "documentType", "dispatch", "localRate", "localCurrency"],
    children: {
      prop: "lines",
      table: "sales_invoice_lines",
      parentKey: "invoice_id",
      fields: DOC_LINE,
    },
  },
  purchaseOrders: {
    table: "purchase_orders",
    fields: [
      ...BASE,
      "number",
      "date",
      "expectedDate",
      "supplierId",
      "warehouseId",
      "currency",
      "fxRate",
      "status",
      "discountKind",
      "discountValue",
      "notes",
      "receivedAt",
      "serviceJobId",
    ],
    optional: ["serviceJobId"],
    children: {
      prop: "lines",
      table: "purchase_order_lines",
      parentKey: "order_id",
      fields: [...DOC_LINE, "receivedQty"],
    },
  },
  payments: {
    table: "payments",
    fields: [
      ...BASE,
      "date",
      "direction",
      "partyType",
      "partyId",
      "invoiceId",
      "amount",
      "currency",
      "fxRate",
      "method",
      "reference",
      "note",
    ],
  },
  expenses: {
    table: "expenses",
    fields: [...BASE, "date", "category", "amount", "currency", "fxRate", "method", "description"],
  },
  serviceJobs: {
    table: "service_jobs",
    fields: [
      ...BASE,
      "number",
      "date",
      "customerId",
      "machineItemId",
      "machineLabel",
      "serialNo",
      "reportedFault",
      "diagnosis",
      "status",
      "technicianId",
      "laborCharge",
      "underWarranty",
      "notes",
      "closedAt",
      "invoiceId",
    ],
    optional: ["invoiceId"],
    children: {
      prop: "parts",
      table: "service_job_parts",
      parentKey: "job_id",
      fields: ["id", "itemId", "qty", "unitPrice", "warehouseId", "consumed"],
    },
  },
};

/**
 * Load order. Not needed for writes — every foreign key is deferred to
 * commit — but reads use it so a reader sees parents before children.
 */
export const COLLECTIONS = Object.keys(SPECS) as CollectionName[];

export function snake(field: string): string {
  return field.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
}

/** Every table whose version decides whether a collection must be reloaded. */
export function tablesOf(spec: TableSpec): string[] {
  return spec.children ? [spec.table, spec.children.table] : [spec.table];
}
