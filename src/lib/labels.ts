/**
 * Status/enum presentation, shared so a status never looks different on two
 * pages. Keys map into the dictionary; tones map into the Badge palette.
 */

import type { MessageKey } from "./i18n";
import type { Tone } from "@/components/ui/primitives";
import type {
  ExpenseCategory,
  InvoiceStatus,
  Item,
  MoveType,
  PurchaseStatus,
  ServiceStatus,
  Warehouse,
  Category,
} from "./data/types";

export const INVOICE_TONE: Record<InvoiceStatus, Tone> = {
  draft: "muted",
  issued: "accent",
  partial: "warn",
  paid: "success",
  void: "muted",
};

export const PURCHASE_TONE: Record<PurchaseStatus, Tone> = {
  draft: "muted",
  ordered: "accent",
  partial: "warn",
  received: "success",
  cancelled: "muted",
};

export const SERVICE_TONE: Record<ServiceStatus, Tone> = {
  received: "neutral",
  diagnosed: "accent",
  awaiting_parts: "warn",
  in_progress: "accent",
  done: "success",
  delivered: "muted",
};

export const MOVE_TONE: Record<MoveType, Tone> = {
  opening: "muted",
  purchase: "success",
  sale: "accent",
  service: "accent",
  transfer: "muted",
  adjustment: "warn",
  return: "neutral",
};

export const INVOICE_STATUSES: InvoiceStatus[] = ["draft", "issued", "partial", "paid", "void"];
export const PURCHASE_STATUSES: PurchaseStatus[] = [
  "draft",
  "ordered",
  "partial",
  "received",
  "cancelled",
];
export const SERVICE_STATUSES: ServiceStatus[] = [
  "received",
  "diagnosed",
  "awaiting_parts",
  "in_progress",
  "done",
  "delivered",
];
export const MOVE_TYPES: MoveType[] = [
  "opening",
  "purchase",
  "sale",
  "service",
  "transfer",
  "adjustment",
  "return",
];
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "rent",
  "salaries",
  "utilities",
  "shipping",
  "marketing",
  "maintenance",
  "other",
];
export const UNITS: Item["unit"][] = ["piece", "box", "set", "meter", "kg", "liter"];
export const PARTY_KINDS = ["clinic", "hospital", "lab", "dealer", "other"] as const;
export const ROLES = ["owner", "accountant", "sales", "technician", "viewer"] as const;
export const PAYMENT_METHODS = ["cash", "bank", "cheque", "card"] as const;

export function invoiceKey(s: InvoiceStatus): MessageKey {
  return `status.${s}` as MessageKey;
}
export function purchaseKey(s: PurchaseStatus): MessageKey {
  return `status.${s}` as MessageKey;
}
export function serviceKey(s: ServiceStatus): MessageKey {
  return `service.${s}` as MessageKey;
}
export function moveKey(s: MoveType): MessageKey {
  return `move.${s}` as MessageKey;
}

/**
 * Localised display name. Records carry Arabic and Turkish names side by side;
 * Turkish falls back to Arabic when a translation has not been entered yet.
 */
export function localName(
  record: { nameAr: string; nameTr?: string } | undefined,
  locale: string,
): string {
  if (!record) return "—";
  return locale === "tr" && record.nameTr ? record.nameTr : record.nameAr;
}

export function itemName(item: Item | undefined, locale: string): string {
  return localName(item, locale);
}

export function warehouseName(w: Warehouse | undefined, locale: string): string {
  return localName(w, locale);
}

/** "Parent › Child" for a category, so nested names are unambiguous in a flat list. */
export function categoryPath(
  category: Category | undefined,
  all: Category[],
  locale: string,
): string {
  if (!category) return "—";
  const parent = category.parentId ? all.find((c) => c.id === category.parentId) : undefined;
  return parent ? `${localName(parent, locale)} › ${localName(category, locale)}` : localName(category, locale);
}
