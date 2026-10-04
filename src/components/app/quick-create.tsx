"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { Button } from "@/components/ui/primitives";
import { IconCart, IconDocument, IconPlus, IconWrench } from "@/components/ui/icons";
import type { MessageKey } from "@/lib/i18n";
import { useMember } from "./member-context";
import { can, type Area, type Level } from "@/lib/permissions";

const ITEMS: { href: string; labelKey: MessageKey; icon: typeof IconDocument; area: Area; level: Level }[] = [
  { href: "/invoices/new", labelKey: "dash.newInvoice", icon: IconDocument, area: "invoices", level: "limited" },
  { href: "/purchases/new", labelKey: "dash.newPurchase", icon: IconCart, area: "purchasing", level: "edit" },
  { href: "/service", labelKey: "dash.newJob", icon: IconWrench, area: "service", level: "edit" },
];

/** The three documents this business creates daily, reachable from any page. */
export function QuickCreate() {
  const t = useT();
  const { role } = useMember();
  const items = ITEMS.filter((item) => can(role, item.area, item.level));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Nothing this role can create: no button at all.
  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <Button
        variant="primary"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <IconPlus />
        <span className="hidden sm:inline">{t("shell.create")}</span>
      </Button>

      {open && (
        <div
          role="menu"
          className="anim-pop-end absolute top-full end-0 mt-2 w-52 bg-surface border border-line rounded-lg shadow-pop overflow-hidden z-40"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 h-11 text-xs hover:bg-sunken transition-colors"
            >
              <item.icon size={16} className="text-muted shrink-0" />
              {t(item.labelKey)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
