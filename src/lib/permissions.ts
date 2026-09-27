import type { Role } from "./data/types";

/**
 * Who may see and do what. The single table the app consults — navigation,
 * page guards, action checks and the money-hiding switch all read from here.
 *
 * With Supabase connected, row-level security in
 * `supabase/migrations/*_init.sql` enforces the same split in the database,
 * so a hand-crafted request cannot get past what this table hides. Keep the
 * two in step when either changes.
 */

/** A top-level area of the app — one per sidebar destination group. */
export type Section =
  | "dashboard"
  | "catalog"
  | "inventory"
  | "invoices"
  | "purchases"
  | "customers"
  | "suppliers"
  | "service"
  | "accounting"
  | "reports"
  | "settings";

/** Something a person does, checked by the server action that does it. */
export type Capability =
  | "catalog.write"
  | "stock.write"
  | "sales.write"
  | "purchases.write"
  | "customers.write"
  | "suppliers.write"
  | "finance.write"
  | "service.write"
  | "service.invoice"
  | "service.orderParts"
  | "settings.write"
  | "users.manage"
  /** Prices, costs, balances and stock value. Service staff work without them. */
  | "money.view";

const ALL: Role[] = ["owner", "accounting", "service"];
const OFFICE: Role[] = ["owner", "accounting"];

const SECTION_ACCESS: Record<Section, Role[]> = {
  dashboard: ALL,
  catalog: ALL,
  inventory: ALL,
  customers: ALL,
  service: ALL,
  invoices: OFFICE,
  purchases: OFFICE,
  suppliers: OFFICE,
  accounting: OFFICE,
  reports: OFFICE,
  settings: ["owner"],
};

const CAPABILITIES: Record<Capability, Role[]> = {
  "catalog.write": OFFICE,
  "stock.write": OFFICE,
  "sales.write": OFFICE,
  "purchases.write": OFFICE,
  "customers.write": ALL,
  "suppliers.write": OFFICE,
  "finance.write": OFFICE,
  "service.write": ["owner", "service"],
  "service.invoice": OFFICE,
  "service.orderParts": OFFICE,
  "settings.write": ["owner"],
  "users.manage": ["owner"],
  "money.view": OFFICE,
};

export function canAccess(role: Role, section: Section): boolean {
  return SECTION_ACCESS[section].includes(role);
}

export function can(role: Role, capability: Capability): boolean {
  return CAPABILITIES[capability].includes(role);
}

/** Longest prefix wins, so `/settings/users` is settings and `/` is only the dashboard. */
const PATH_SECTIONS: [string, Section][] = [
  ["/categories", "catalog"],
  ["/products", "catalog"],
  ["/spare-parts", "catalog"],
  ["/inventory", "inventory"],
  ["/invoices", "invoices"],
  ["/purchases", "purchases"],
  ["/customers", "customers"],
  ["/suppliers", "suppliers"],
  ["/service", "service"],
  ["/accounting", "accounting"],
  ["/reports", "reports"],
  ["/settings", "settings"],
  ["/print/invoice", "invoices"],
  ["/print/purchase", "purchases"],
];

export function sectionForPath(pathname: string): Section {
  for (const [prefix, section] of PATH_SECTIONS) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return section;
  }
  return "dashboard";
}

export function canVisit(role: Role, pathname: string): boolean {
  return canAccess(role, sectionForPath(pathname));
}
