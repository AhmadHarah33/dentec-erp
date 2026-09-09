"use client";

import { Logo, MobileNav } from "./sidebar";
import { GlobalSearch } from "./global-search";
import { QuickCreate } from "./quick-create";
import { RoleSwitcher } from "./role-switcher";
import { LocaleToggle } from "./locale-toggle";
import type { SearchEntry } from "@/lib/search";

export function Topbar({ search }: { search: SearchEntry[] }) {
  return (
    <header className="h-16 shrink-0 hairline-b bg-canvas/80 backdrop-blur-md sticky top-0 z-30 flex items-center gap-3 px-4 lg:px-8 no-print">
      <MobileNav />
      <Logo className="h-6 lg:hidden" />

      <div className="flex-1 flex justify-center px-2">
        <GlobalSearch entries={search} />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Both of these repeat at the foot of the mobile navigation drawer,
            where there is room for them; the bar itself keeps only what fits
            beside the search field on a phone. */}
        <div className="hidden sm:block">
          <RoleSwitcher />
        </div>
        <QuickCreate />
        <div className="hidden lg:block">
          <LocaleToggle />
        </div>
      </div>
    </header>
  );
}
