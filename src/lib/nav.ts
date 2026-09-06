import type { ComponentType, SVGProps } from "react";
import type { MessageKey } from "./i18n";
import {
  IconChart,
  IconCoins,
  IconCart,
  IconDashboard,
  IconDocument,
  IconLayers,
  IconSettings,
  IconTag,
  IconTooth,
  IconTruck,
  IconUsers,
  IconWrench,
} from "@/components/ui/icons";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

export interface NavItem {
  href: string;
  labelKey: MessageKey;
  /** Sidebar glyph. A label alone is hard to scan down a long sidebar. */
  icon: IconComponent;
}

export interface NavGroup {
  titleKey: MessageKey;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    titleKey: "nav.group.overview",
    items: [{ href: "/", labelKey: "nav.dashboard", icon: IconDashboard }],
  },
  {
    titleKey: "nav.group.catalog",
    items: [
      { href: "/categories", labelKey: "nav.categories", icon: IconTag },
      { href: "/products", labelKey: "nav.products", icon: IconTooth },
      { href: "/spare-parts", labelKey: "nav.spareParts", icon: IconWrench },
    ],
  },
  {
    titleKey: "nav.group.stock",
    items: [
      // Moves is a tab on this page, not a destination of its own: it answers
      // "why is this number what it is", which is a question you only ask
      // while looking at the number.
      {
        href: "/inventory",
        labelKey: "nav.inventory",
        icon: IconLayers,
      },
    ],
  },
  {
    titleKey: "nav.group.sales",
    items: [
      { href: "/invoices", labelKey: "nav.invoices", icon: IconDocument },
      { href: "/purchases", labelKey: "nav.purchases", icon: IconCart },
      { href: "/customers", labelKey: "nav.customers", icon: IconUsers },
      { href: "/suppliers", labelKey: "nav.suppliers", icon: IconTruck },
      { href: "/service", labelKey: "nav.service", icon: IconWrench },
    ],
  },
  {
    titleKey: "nav.group.finance",
    items: [
      { href: "/accounting", labelKey: "nav.accounting", icon: IconCoins },
      { href: "/reports", labelKey: "nav.reports", icon: IconChart },
    ],
  },
  {
    titleKey: "nav.group.system",
    items: [
      // Warehouses and users live inside Settings: both are configuration you
      // touch a few times a year, and they were costing two of the sixteen
      // slots in a sidebar you read every day.
      { href: "/settings", labelKey: "nav.settings", icon: IconSettings },
    ],
  },
];

/**
 * Exact match for the dashboard, prefix match elsewhere — but `/inventory`
 * must not swallow `/inventory/moves`, so deeper siblings win.
 */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (pathname === href) return true;
  if (!pathname.startsWith(href + "/")) return false;

  // A longer nav entry that also matches takes precedence over this one.
  const rest = pathname.slice(href.length);
  const deeper = NAV.flatMap((g) => g.items).some(
    (i) => i.href.length > href.length && (pathname === i.href || pathname.startsWith(i.href + "/")),
  );
  return !deeper || rest === "";
}
