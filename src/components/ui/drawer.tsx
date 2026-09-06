"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/context";
import { IconClose } from "./icons";

/**
 * A record opened over its list.
 *
 * Clicking a row must not cost you your filters, your scroll position or your
 * place in a scan — so a row opens here, read-only, and editing is the one
 * thing that takes you to a full page. That is the rule everywhere in the app:
 * drawer to look, page to edit.
 *
 * On a phone it is a bottom sheet instead of a side panel, because a 320px
 * side panel on a 375px screen is a full-screen dialog wearing a costume.
 */
export function Drawer({
  open,
  onClose,
  title,
  meta,
  badge,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  meta?: string;
  /** Status chip beside the title. */
  badge?: ReactNode;
  /** Actions pinned to the foot — normally the link to the full page. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 no-print">
      <div
        className="anim-fade absolute inset-0 bg-ink/35 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "absolute bg-surface shadow-modal flex flex-col",
          // It rises from the bottom on a phone and slides in from the inline
          // end above it, matching the edge it is pinned to in each case.
          "anim-sheet sm:anim-slide-end",
          // Phone: a sheet rising from the bottom, capped so the list behind
          // it stays visible and the dialog still reads as temporary.
          "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-lg border-t border-line",
          // Tablet and up: a panel down the inline end, full height.
          "sm:inset-y-0 sm:start-auto sm:end-0 sm:bottom-auto sm:w-[26rem] sm:max-h-none",
          "sm:rounded-none sm:border-t-0 sm:border-s sm:border-line",
        )}
      >
        <div className="flex items-start gap-3 px-5 py-4 hairline-b shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-sm font-semibold truncate">{title}</h2>
              {badge}
            </div>
            {meta && <p className="text-2xs text-muted mt-0.5 truncate">{meta}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("action.close")}
            className="shrink-0 text-faint hover:text-ink transition-colors p-1 -me-1"
          >
            <IconClose />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2">{children}</div>

        {footer && (
          <div className="flex items-center gap-2 px-5 py-3 hairline-t bg-sunken/60 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** A block of labelled values inside a drawer, hairline-separated. */
export function DrawerSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="py-2">
      {title && (
        <h3 className="text-2xs font-semibold text-faint uppercase tracking-wider mb-1 pt-2">
          {title}
        </h3>
      )}
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}
