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
    <nav className="flex flex-col py-2 divide-y divide-line/60">
      {NAV.map((group) => {
        const open = group.titleKey === currentGroup || opened.includes(group.titleKey);
        return (
        <div key={group.titleKey} className="py-2 first:pt-0 last:pb-0">
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

/**
 * The wordmark itself, SVG first since every browser in use renders it; the
 * PNG only covers a `<picture>` source that can't decode SVG at all.
 */
export function Logo({ className }: { className?: string }) {
  const t = useT();
  return (
    <picture>
      <source srcSet="/logo.svg" type="image/svg+xml" />
      <img src="/logo.png" alt={t("app.name")} className={cn("w-auto", className)} />
    </picture>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-center h-16 px-6 hairline-b shrink-0">
      <Logo className="h-7" />
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
          <Logo className="h-7" />
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
