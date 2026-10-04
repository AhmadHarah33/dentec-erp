/**
 * What can be imported, and which columns each kind reads. Shared by the
 * template download, the file reader on the client and the validator on the
 * server, so a column cannot exist in one and not the others.
 */

import { csvCell } from "./csv";

export type ImportKind = "products" | "spare_parts" | "customers" | "suppliers" | "opening_stock";

export const IMPORT_KINDS: ImportKind[] = ["products", "spare_parts", "customers", "suppliers", "opening_stock"];

export interface ImportColumn {
  key: string;
  required?: boolean;
  /** A realistic value for the template's example row. */
  example: string;
}

const ITEM_COLUMNS: ImportColumn[] = [
  { key: "sku", required: true, example: "DC-1000" },
  { key: "nameAr", required: true, example: "كرسي أسنان" },
  { key: "nameTr", example: "Dental ünite" },
  { key: "category", example: "" },
  { key: "unit", example: "piece" },
  { key: "cost", example: "500" },
  { key: "price", example: "900" },
  { key: "taxRate", example: "20" },
  { key: "minStock", example: "1" },
  { key: "brand", example: "" },
  { key: "model", example: "" },
  { key: "barcode", example: "" },
  { key: "notes", example: "" },
  { key: "tracksSerial", example: "no" },
  { key: "warrantyMonths", example: "0" },
];

const PARTY_COLUMNS: ImportColumn[] = [
  { key: "code", example: "" },
  { key: "name", required: true, example: "Example Clinic" },
  { key: "kind", example: "clinic" },
  { key: "contactPerson", example: "" },
  { key: "phone", example: "" },
  { key: "email", example: "" },
  { key: "address", example: "" },
  { key: "city", example: "" },
  { key: "taxNumber", example: "" },
  { key: "creditLimit", example: "0" },
  { key: "notes", example: "" },
];

export const COLUMNS: Record<ImportKind, ImportColumn[]> = {
  products: ITEM_COLUMNS,
  // Spare parts are never serial-tracked, so the last two columns would only confuse.
  spare_parts: ITEM_COLUMNS.filter((c) => c.key !== "tracksSerial" && c.key !== "warrantyMonths"),
  customers: PARTY_COLUMNS,
  suppliers: PARTY_COLUMNS.map((c) => (c.key === "kind" ? { ...c, example: "dealer" } : c)),
  opening_stock: [
    { key: "sku", required: true, example: "DC-1000" },
    { key: "qty", required: true, example: "5" },
    { key: "warehouse", example: "" },
    { key: "unitCost", example: "" },
    { key: "date", example: "" },
  ],
};

/** Header text → column key: ignores case, spaces, underscores and hyphens. */
const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]+/g, "");

export function templateCsv(kind: ImportKind): string {
  const cols = COLUMNS[kind];
  // BOM so Excel opens the Arabic example as UTF-8 rather than guessing a code page.
  return (
    "﻿" +
    [cols.map((c) => c.key), cols.map((c) => c.example)].map((r) => r.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}

export interface ParsedTable {
  records: Record<string, string>[];
  /** Required columns the file does not have. */
  missing: string[];
  /** Headers the importer does not know, ignored. */
  unknown: string[];
}

/** First row is the header; every later row becomes a record keyed by column. */
export function toRecords(kind: ImportKind, table: string[][]): ParsedTable {
  const [header = [], ...body] = table;
  const wanted = new Map(COLUMNS[kind].map((c) => [norm(c.key), c.key]));
  const index = new Map<string, number>();
  const unknown: string[] = [];
  header.forEach((h, i) => {
    const key = wanted.get(norm(String(h)));
    if (key && !index.has(key)) index.set(key, i);
    else if (String(h).trim()) unknown.push(String(h).trim());
  });
  const missing = COLUMNS[kind].filter((c) => c.required && !index.has(c.key)).map((c) => c.key);

  const records = body.map((cells) => {
    const rec: Record<string, string> = {};
    for (const [key, i] of index) rec[key] = String(cells[i] ?? "").trim();
    return rec;
  });
  return { records, missing, unknown };
}

export const MAX_IMPORT_ROWS = 5000;
