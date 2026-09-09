"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/context";
import { VIEW_ROLES, viewRoleKey, type ViewRole } from "@/lib/roles";
import { useRole } from "./role-context";
import { IconCheck, IconChevronDown, IconCoins, IconUser, IconWrench } from "@/components/ui/icons";

const ROLE_ICON: Record<ViewRole, typeof IconUser> = {
  owner: IconUser,
  accounting: IconCoins,
  service: IconWrench,
};

/**
 * Picks which job the dashboard should be arranged for. A menu rather than
 * three pills: three Arabic role names side by side eat the width the search
 * field needs, and this is a setting you change rarely.
 *
 * `variant="block"` is the full-width form used inside the mobile navigation,
 * where there is room to show the current role as a labelled row.
 */
export function RoleSwitcher({ variant = "compact" }: { variant?: "compact" | "block" }) {
  const t = useT();
  const { role, setRole, pending } = useRole();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const Current = ROLE_ICON[role];

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

  const block = variant === "block";

  return (
    <div ref={ref} className={cn("relative", block && "w-full")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("viewRole.label")}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-line bg-surface",
          "text-2xs font-medium text-ink transition-colors hover:bg-sunken disabled:opacity-40",
          block ? "w-full h-11 px-4 rounded-sm" : "h-9 px-3",
        )}
      >
        <Current size={15} className="text-accent shrink-0" />
        <span className={cn("truncate", !block && "hidden md:inline")}>{t(viewRoleKey(role))}</span>
        <IconChevronDown
          size={12}
          className={cn(
            "text-faint shrink-0 transition-transform duration-[var(--dur-swift)]",
            block && "ms-auto",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-40 bg-surface border border-line rounded-lg shadow-pop overflow-hidden",
            block ? "anim-pop bottom-full end-0 start-0 mb-2" : "anim-pop-end top-full end-0 mt-2 w-56",
          )}
        >
          <p className="px-4 pt-3 pb-2 text-2xs text-faint leading-snug">
            {t("viewRole.hint")}
          </p>
          {VIEW_ROLES.map((r) => {
            const RoleIcon = ROLE_ICON[r];
            const active = r === role;
            return (
              <button
                key={r}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setRole(r);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 h-11 text-xs transition-colors text-start",
                  active ? "bg-accent-soft text-accent font-semibold" : "hover:bg-sunken",
                )}
              >
                <RoleIcon size={16} className="shrink-0" />
                <span className="flex-1 truncate">{t(viewRoleKey(r))}</span>
                {active && <IconCheck size={14} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
