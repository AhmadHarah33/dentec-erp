"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Role } from "@/lib/data/types";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";
import { Button, Num } from "@/components/ui/primitives";
import { completeTour } from "@/app/actions/auth";
import { useRole } from "./role-context";

/** Dispatched on `window` by "Replay walkthrough" in the account menu. */
export const TOUR_EVENT = "dentec:tour";

interface Step {
  /** A `data-tour` value. No target: the card sits in the middle of the screen. */
  target?: string;
  titleKey: MessageKey;
  bodyKey: MessageKey;
}

/**
 * One tour per role, each short enough to finish: what that person will use
 * on day one, in the order they will reach for it. Everything else they find
 * by looking.
 */
const STEPS: Record<Role, Step[]> = {
  owner: [
    { titleKey: "tour.welcome.title", bodyKey: "tour.welcome.owner" },
    { target: "nav-/", titleKey: "tour.dashboard.title", bodyKey: "tour.dashboard.owner" },
    { target: "search", titleKey: "tour.search.title", bodyKey: "tour.search.body" },
    { target: "create", titleKey: "tour.create.title", bodyKey: "tour.create.owner" },
    { target: "nav-/invoices", titleKey: "tour.invoices.title", bodyKey: "tour.invoices.body" },
    { target: "nav-/service", titleKey: "tour.service.title", bodyKey: "tour.service.owner" },
    { target: "nav-/settings", titleKey: "tour.settings.title", bodyKey: "tour.settings.body" },
  ],
  accounting: [
    { titleKey: "tour.welcome.title", bodyKey: "tour.welcome.accounting" },
    { target: "nav-/", titleKey: "tour.dashboard.title", bodyKey: "tour.dashboard.accounting" },
    { target: "nav-/invoices", titleKey: "tour.invoices.title", bodyKey: "tour.invoices.body" },
    { target: "nav-/purchases", titleKey: "tour.purchases.title", bodyKey: "tour.purchases.body" },
    { target: "nav-/accounting", titleKey: "tour.accounting.title", bodyKey: "tour.accounting.body" },
    { target: "nav-/reports", titleKey: "tour.reports.title", bodyKey: "tour.reports.body" },
    { target: "create", titleKey: "tour.create.title", bodyKey: "tour.create.accounting" },
  ],
  service: [
    { titleKey: "tour.welcome.title", bodyKey: "tour.welcome.service" },
    { target: "nav-/service", titleKey: "tour.service.title", bodyKey: "tour.service.service" },
    { target: "create", titleKey: "tour.create.title", bodyKey: "tour.create.service" },
    { target: "nav-/spare-parts", titleKey: "tour.spareParts.title", bodyKey: "tour.spareParts.body" },
    { target: "nav-/inventory", titleKey: "tour.inventory.title", bodyKey: "tour.inventory.body" },
    { target: "nav-/customers", titleKey: "tour.customers.title", bodyKey: "tour.customers.body" },
    { target: "search", titleKey: "tour.search.title", bodyKey: "tour.search.body" },
  ],
};

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function visible(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/**
 * Where a step points. A sidebar link inside a collapsed group points at the
 * group's header instead; on a phone, where the sidebar is a slide-over, it
 * points at the menu button and says so.
 */
function resolveTarget(target: string | undefined): { el: HTMLElement | null; viaMenu: boolean } {
  if (!target) return { el: null, viaMenu: false };
  const all = Array.from(document.querySelectorAll(`[data-tour="${target}"]`));
  const direct = all.find(visible);
  if (direct) return { el: direct, viaMenu: false };

  if (target.startsWith("nav-")) {
    for (const link of all) {
      const header = link.closest("[data-nav-group]")?.querySelector("[data-nav-group-header]") ?? null;
      if (visible(header)) return { el: header, viaMenu: false };
    }
    const menu = document.querySelector('[data-tour="menu"]');
    if (visible(menu)) return { el: menu, viaMenu: true };
  }
  return { el: null, viaMenu: false };
}

const PAD = 6;
const GAP = 12;
const CARD_WIDTH = 340;

export function Tour({ autoStart }: { autoStart: boolean }) {
  const t = useT();
  const { role } = useRole();
  const steps = STEPS[role];

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [viaMenu, setViaMenu] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [cardHeight, setCardHeight] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const recorded = useRef(false);

  // First sign-in: start once the page has painted, so targets exist.
  useEffect(() => {
    if (!autoStart || recorded.current) return;
    const id = window.setTimeout(() => {
      setIndex(0);
      setOpen(true);
    }, 400);
    return () => window.clearTimeout(id);
  }, [autoStart]);

  // "Replay walkthrough" from the account menu.
  useEffect(() => {
    function replay() {
      setIndex(0);
      setOpen(true);
    }
    window.addEventListener(TOUR_EVENT, replay);
    return () => window.removeEventListener(TOUR_EVENT, replay);
  }, []);

  const step = steps[Math.min(index, steps.length - 1)];

  const measure = useCallback(() => {
    setViewport({ width: window.innerWidth, height: window.innerHeight });
    const { el, viaMenu } = resolveTarget(step?.target);
    setViaMenu(viaMenu);
    if (!el) return setBox(null);
    const r = el.getBoundingClientRect();
    setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [step]);

  useLayoutEffect(() => {
    if (!open) return;
    const { el } = resolveTarget(step?.target);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step, measure]);

  useLayoutEffect(() => {
    if (open && cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [open, index, box, viaMenu]);

  // Keep focus inside the card, the way every other dialog here behaves.
  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open, index]);

  const finish = useCallback(() => {
    setOpen(false);
    if (!recorded.current) {
      recorded.current = true;
      void completeTour();
    }
  }, []);

  const next = useCallback(() => {
    if (index >= steps.length - 1) finish();
    else setIndex((i) => i + 1);
  }, [index, steps.length, finish]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") finish();
      else if (e.key === "Enter") next();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, finish, next]);

  if (!open || !step || typeof document === "undefined") return null;

  const phone = viewport.width < 640;
  const last = index === steps.length - 1;

  // Card placement: under the target if it fits, above it otherwise; pinned
  // to the bottom edge on a phone, where a floating card would cover the
  // thing it is pointing at.
  let cardStyle: React.CSSProperties | undefined;
  if (!phone && box) {
    const width = Math.min(CARD_WIDTH, viewport.width - 32);
    const below = box.top + box.height + GAP;
    const fitsBelow = below + cardHeight < viewport.height - 16;
    const top = fitsBelow ? below : Math.max(16, box.top - GAP - cardHeight);
    const centre = box.left + box.width / 2 - width / 2;
    const left = Math.min(Math.max(16, centre), viewport.width - width - 16);
    cardStyle = { top, left, width };
  }

  // Four panels around the target rather than one scrim with a hole: no
  // shadow tricks, and the highlighted control stays clickable-looking but
  // covered, so the tour cannot be half-left by a stray tap.
  const scrim = "fixed bg-ink/45 anim-fade";

  return createPortal(
    <div className="fixed inset-0 z-[70] no-print" aria-live="polite">
      {box ? (
        <>
          <div className={scrim} style={{ top: 0, left: 0, right: 0, height: Math.max(0, box.top) }} />
          <div
            className={scrim}
            style={{ top: box.top + box.height, left: 0, right: 0, bottom: 0 }}
          />
          <div
            className={scrim}
            style={{ top: box.top, left: 0, width: Math.max(0, box.left), height: box.height }}
          />
          <div
            className={scrim}
            style={{ top: box.top, left: box.left + box.width, right: 0, height: box.height }}
          />
          <div
            className="fixed rounded-sm border-2 border-accent pointer-events-none transition-[top,left,width,height] duration-[var(--dur-glide)] ease-[var(--ease-settle)]"
            style={box}
            aria-hidden="true"
          />
        </>
      ) : (
        <div className={cn(scrim, "inset-0")} />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        style={cardStyle}
        className={cn(
          "fixed bg-surface border border-line rounded-lg shadow-modal p-5 outline-none",
          phone
            ? "anim-sheet inset-x-3 bottom-3"
            : box
              ? "anim-pop"
              : "anim-rise inset-x-0 mx-auto top-1/2 -translate-y-1/2 w-[min(380px,calc(100vw-32px))]",
        )}
      >
        <p className="text-2xs font-medium text-faint">
          {t("tour.step", { n: "__N__", total: "__T__" })
            .split(/(__N__|__T__)/)
            .map((part, i) =>
              part === "__N__" ? (
                <Num key={i}>{index + 1}</Num>
              ) : part === "__T__" ? (
                <Num key={i}>{steps.length}</Num>
              ) : (
                part
              ),
            )}
        </p>
        <h2 id="tour-title" className="text-sm font-semibold mt-1">
          {t(step.titleKey)}
        </h2>
        <p id="tour-body" className="text-xs text-muted leading-relaxed mt-1.5">
          {t(step.bodyKey)}
        </p>
        {viaMenu && <p className="text-2xs text-faint leading-relaxed mt-2">{t("tour.menuHint")}</p>}

        <div className="flex items-center gap-1.5 mt-4" aria-hidden="true">
          {steps.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-[width,background-color] duration-[var(--dur-swift)]",
                i === index ? "w-5 bg-accent" : "w-1.5 bg-line-strong",
              )}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 mt-4">
          {!last && (
            <Button variant="ghost" size="sm" onClick={finish}>
              {t("tour.skip")}
            </Button>
          )}
          <div className="flex-1" />
          {index > 0 && (
            <Button size="sm" onClick={back}>
              {t("tour.back")}
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={next}>
            {last ? t("tour.done") : t("tour.next")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
