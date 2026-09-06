"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { NAV, isActive } from "@/lib/nav";
import { useT } from "@/lib/i18n/context";
import { IconChevronDown } from "@/components/ui/icons";
import { RoleSwitcher } from "./role-switcher";
import { LocaleToggle } from "./locale-toggle";

/**
 * Sixteen destinations in six groups is too many to scan at once, so a group
 * opens only when you are inside it. Opening another does not close it — once
 * you have deliberately opened a group it stays open for the session, which
 * keeps the sidebar from fighting you while you move between two areas.
 */
function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  const pathname = usePathname();

  const currentGroup =
    NAV.find((g) => g.items.some((i) => isActive(pathname, i.href)))?.titleKey ?? NAV[0].titleKey;

  const [opened, setOpened] = useState<string[]>([]);

  function toggle(key: string) {
    setOpened((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  return (
    <nav className="flex flex-col gap-1 py-4">
      {NAV.map((group) => {
        const open = group.titleKey === currentGroup || opened.includes(group.titleKey);
        return (
        <div key={group.titleKey}>
          <button
            type="button"
            onClick={() => toggle(group.titleKey)}
            aria-expanded={open}
            className="w-full flex items-center gap-2 px-6 h-9 text-2xs font-semibold text-faint uppercase tracking-wider hover:text-muted transition-colors"
          >
            <span className="flex-1 text-start">{t(group.titleKey)}</span>
            <IconChevronDown
              size={12}
              className={cn("transition-transform shrink-0", !open && "-rotate-90 rtl:rotate-90")}
            />
          </button>
          <ul className={cn("px-3 space-y-0.5 pb-1", !open && "hidden")}>
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 h-10 px-3 rounded-sm text-xs transition-colors",
                      active
                        ? "bg-accent-soft text-accent font-semibold"
                        : "text-muted hover:text-ink hover:bg-sunken",
                    )}
                  >
                    <item.icon size={17} className="shrink-0" />
                    <span className="truncate">{t(item.labelKey)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        );
      })}
    </nav>
  );
}

function Wordmark() {
  const t = useT();
  return (
    <Link href="/" className="flex items-center gap-2.5 h-16 px-6 hairline-b shrink-0">
      {/* A tooth in outline — the one piece of ornament in the whole interface. */}
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
        <path
          d="M4.2 2.2C2.6 2.2 1.8 3.6 1.9 5.3c.1 1.9.7 2.7 1 4.4.3 1.6.2 4.1 1.4 4.1 1.1 0 1-2.2 1.4-3.5.2-.8.6-1.2 1.3-1.2s1.1.4 1.3 1.2c.4 1.3.3 3.5 1.4 3.5 1.2 0 1.1-2.5 1.4-4.1.3-1.7.9-2.5 1-4.4.1-1.7-.7-3.1-2.3-3.1-1.1 0-1.7.5-2.8.5s-1.7-.5-2.8-.5Z"
          stroke="var(--color-accent)"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-sm font-bold tracking-tight text-accent">{t("app.name")}</span>
    </Link>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 border-e border-line bg-surface h-dvh sticky top-0 no-print">
      <Wordmark />
      <div className="overflow-y-auto flex-1">
        <NavList />
      </div>
    </aside>
  );
}

/**
 * One line of the hamburger. Position and rotation come from the caller.
 *
 * `rotate` is listed in the transition separately from `transform`: Tailwind
 * v4 compiles `rotate-45` to the standalone `rotate` property, so a transition
 * on `transform` alone would snap instead of turning.
 */
function Bar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "absolute inset-x-0 h-[1.5px] rounded-full bg-current origin-center",
        "transition-[rotate,transform,opacity,top,bottom]",
        "duration-[var(--dur-glide)] ease-[var(--ease-settle)]",
        className,
      )}
    />
  );
}

/**
 * The same navigation as a slide-over, for narrow screens.
 *
 * The panel is portalled to <body> for a reason that is easy to lose: the top
 * bar this button lives in uses `backdrop-blur`, and an element with a
 * backdrop-filter becomes the containing block for every `position: fixed`
 * descendant. Rendered in place, `fixed inset-0` resolved to the 64px header
 * instead of the viewport and the menu opened as a sliver. Anything fixed that
 * is rendered inside the header has to leave it.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const t = useT();

  // A portal needs a document, which the server render does not have.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const panel = (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
      <div
        className="anim-fade absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div className="anim-slide-start absolute inset-y-0 start-0 w-72 max-w-[85vw] bg-surface border-e border-line shadow-modal flex flex-col">
        {/* Padded clear of the toggle, which sits over this corner. */}
        <div className="flex items-center h-16 ps-14 pe-6 hairline-b shrink-0">
          <span className="text-sm font-bold tracking-tight text-accent">{t("app.name")}</span>
        </div>
        <div className="overflow-y-auto flex-1">
          <NavList onNavigate={() => setOpen(false)} />
        </div>
        {/* The two preferences the top bar has no room for on a phone. */}
        <div className="hairline-t p-4 flex flex-col gap-3 shrink-0">
          <RoleSwitcher variant="block" />
          <LocaleToggle block />
        </div>
      </div>
    </div>
  );

  /*
   * The button is portalled too, and for the same reason as the panel: it has
   * to paint above the overlay so one control both opens and closes the menu,
   * and a child of the blurred header cannot — the header is its own stacking
   * context, so no z-index on a descendant will lift it out.
   *
   * It is positioned to land exactly where it sat in the header, and the
   * header keeps a same-size placeholder so the layout does not shift.
   */
  const toggle = (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      aria-label={t(open ? "action.close" : "app.name")}
      style={{ top: 14, insetInlineStart: 8 }}
      className="lg:hidden fixed z-[60] text-muted hover:text-ink transition-colors p-2"
    >
      <span className="relative block w-5 h-[14px]">
        <Bar className={open ? "top-1/2 -mt-px rotate-45" : "top-0"} />
        <Bar className={cn("top-1/2 -mt-px", open && "opacity-0 scale-x-50")} />
        <Bar className={open ? "top-1/2 -mt-px -rotate-45" : "bottom-0"} />
      </span>
    </button>
  );

  return (
    <>
      {/* Holds the toggle's place in the header's flex row. */}
      <span className="lg:hidden w-9 shrink-0" aria-hidden="true" />

      {mounted && createPortal(toggle, document.body)}
      {open && mounted && createPortal(panel, document.body)}
    </>
  );
}
