"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Sibling pages that belong to one subject, shown as pills under the page
 * header — stock and its ledger, settings and its lists.
 *
 * A tab is a real link, not a client-side toggle: each view keeps its own URL,
 * so it can be bookmarked, opened in a new tab, and reached by the back
 * button. The strip scrolls sideways rather than wrapping, which keeps it one
 * line tall on a phone.
 */
export function PageTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <div className="-mx-4 lg:mx-0 px-4 lg:px-0 mb-6 overflow-x-auto no-print [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-full border border-line bg-sunken">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "h-9 px-4 rounded-full text-2xs whitespace-nowrap transition-colors grid place-items-center",
                active
                  ? "bg-surface text-ink shadow-card font-semibold"
                  : "text-muted hover:text-ink",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
