/**
 * Who may do what. The single source of truth for permissions: server
 * actions check it before writing, pages check it before rendering, and the
 * navigation and buttons read it so nobody is offered what they would be
 * refused. Keep it a pure table — no I/O — so client components can import it.
 *
 * Levels are ordered: none < view < limited < edit.
 *
 *   view     read the area
 *   limited  a deliberate subset of edit, spelled out per area below
 *   edit     everything in the area
 *
 * The table is the one agreed in RELEASE-PLAN.md.
 */

import type { Role } from "./data/types";

export type Area =
  | "catalog" // products, spare parts, categories
  | "inventory" // stock levels, moves, adjustments, transfers
  | "customers"
  | "purchasing" // suppliers and purchase orders
  | "invoices"
  | "finance" // payments, expenses, accounting
  | "service"
  | "reports"
  | "settings"; // company settings, warehouses, users, import, audit log

export type Level = "none" | "view" | "limited" | "edit";

const RANK: Record<Level, number> = { none: 0, view: 1, limited: 2, edit: 3 };

/**
 * `limited` means, per area:
 *   invoices — create, edit and issue drafts; not void, record payments or
 *              delete anything issued (sales)
 *   reports  — no cost, margin or stock valuation (sales, service_lead)
 */
export const MATRIX: Record<Role, Record<Area, Level>> = {
  owner: {
    catalog: "edit",
    inventory: "edit",
    customers: "edit",
    purchasing: "edit",
    invoices: "edit",
    finance: "edit",
    service: "edit",
    reports: "edit",
    settings: "edit",
  },
  accountant: {
    catalog: "view",
    inventory: "view",
    customers: "edit",
    purchasing: "edit",
    invoices: "edit",
    finance: "edit",
    service: "view",
    reports: "edit",
    settings: "none",
  },
  sales: {
    catalog: "view",
    inventory: "view",
    customers: "edit",
    purchasing: "view",
    invoices: "limited",
    finance: "none",
    service: "view",
    reports: "limited",
    settings: "none",
  },
  technician: {
    catalog: "view",
    // Technicians consume parts through service jobs, which is a service
    // write; they do not adjust or transfer stock directly.
    inventory: "view",
    customers: "view",
    purchasing: "none",
    invoices: "none",
    finance: "none",
    service: "edit",
    reports: "none",
    settings: "none",
  },
  // Head of technical service: a technician who also runs the parts side —
  // stock counts and moves, supplier and purchase-order visibility, and
  // cost-free reports (the same `limited` view as sales).
  service_lead: {
    catalog: "view",
    inventory: "edit",
    customers: "view",
    purchasing: "view",
    invoices: "none",
    finance: "none",
    service: "edit",
    reports: "limited",
    settings: "none",
  },
  viewer: {
    catalog: "view",
    inventory: "view",
    customers: "view",
    purchasing: "view",
    invoices: "view",
    finance: "view",
    service: "view",
    reports: "edit",
    settings: "none",
  },
};

export function levelOf(role: Role, area: Area): Level {
  return MATRIX[role]?.[area] ?? "none";
}

/** True when `role` has at least `needed` on `area`. */
export function can(role: Role, area: Area, needed: Level): boolean {
  return RANK[levelOf(role, area)] >= RANK[needed];
}

/** The area a route belongs to, for page guards and the sidebar. */
export function areaForPath(pathname: string): Area | null {
  const first = pathname.split("/")[1] ?? "";
  switch (first) {
    case "":
      return null; // the dashboard: every member
    case "products":
    case "spare-parts":
    case "categories":
      return "catalog";
    case "inventory":
      return "inventory";
    case "customers":
      return "customers";
    case "suppliers":
    case "purchases":
      return "purchasing";
    case "invoices":
      return "invoices";
    case "accounting":
      return "finance";
    case "service":
      return "service";
    case "reports":
      return "reports";
    case "settings":
      return "settings";
    default:
      return null;
  }
}

/**
 * What the dashboard leads with. This used to be a cookie anyone could flip;
 * it now follows the signed-in person's role.
 */
export type DashboardFocus = "owner" | "accounting" | "service";

export function dashboardFocus(role: Role): DashboardFocus {
  if (role === "accountant") return "accounting";
  if (role === "technician" || role === "service_lead") return "service";
  return "owner";
}

export const ROLES: Role[] = ["owner", "accountant", "sales", "technician", "viewer"];
