import type { MessageKey } from "./i18n";

/**
 * Tab strips, declared once so two sibling pages can never disagree about
 * which tabs exist or what order they come in.
 */
export interface TabDef {
  href: string;
  labelKey: MessageKey;
}

export const STOCK_TABS: TabDef[] = [
  { href: "/inventory", labelKey: "tab.stock" },
  { href: "/inventory/moves", labelKey: "tab.moves" },
];

export const SETTINGS_TABS: TabDef[] = [
  { href: "/settings", labelKey: "tab.general" },
  { href: "/settings/warehouses", labelKey: "nav.warehouses" },
  { href: "/settings/users", labelKey: "nav.users" },
];
