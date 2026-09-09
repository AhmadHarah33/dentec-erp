"use client";

import { useEffect, useLayoutEffect, useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useLocale } from "@/lib/i18n/context";
import type { Customer, ServiceJob, ServiceStatus, User } from "@/lib/data/types";
import { serviceKey } from "@/lib/labels";
import { daysBetween, today } from "@/lib/dates";
import { formatNumber } from "@/lib/money";
import { countedPhrase } from "@/lib/plural";
import { setJobStatus } from "@/app/actions/service";
import { Badge, Num } from "@/components/ui/primitives";
import { IconAlert, IconChevronDown, IconCheck, IconLayers } from "@/components/ui/icons";
import { animateSpring, prefersReducedMotion, project } from "@/lib/motion/spring";

/**
 * The columns the workshop actually works. `delivered` is deliberately not one
 * of them: a delivered job is finished, and a column that only ever grows is a
 * column nobody reads. Delivered jobs are one toggle away instead.
 */
const COLUMNS: ServiceStatus[] = [
  "received",
  "diagnosed",
  "awaiting_parts",
  "in_progress",
  "done",
];

const ALL_STATUSES: ServiceStatus[] = [...COLUMNS, "delivered"];

/** The accent stripe at the top of each column, so stages read before words do. */
const COLUMN_BAR: Record<ServiceStatus, string> = {
  received: "bg-line-strong",
  diagnosed: "bg-accent",
  awaiting_parts: "bg-warn",
  in_progress: "bg-accent",
  done: "bg-success",
  delivered: "bg-faint",
};

/** Pixels of pointer travel before a press commits to a drag, not a click. */
const DRAG_THRESHOLD = 6;
/** Only samples from this recent a window feed the release-velocity estimate. */
const VELOCITY_WINDOW_MS = 100;

type Sample = { x: number; y: number; t: number };

type DragState = {
  id: string;
  pointerId: number;
  grabX: number;
  grabY: number;
  originLeft: number;
  originTop: number;
  samples: Sample[];
  committed: boolean;
};

type FlipEntry = { left: number; top: number; vx: number; vy: number };

function velocityFromSamples(samples: Sample[]): { vx: number; vy: number } {
  if (samples.length < 2) return { vx: 0, vy: 0 };
  const last = samples[samples.length - 1];
  let first = last;
  for (let i = samples.length - 1; i >= 0; i--) {
    first = samples[i];
    if (last.t - samples[i].t > VELOCITY_WINDOW_MS) break;
  }
  const dt = last.t - first.t || 1;
  return { vx: ((last.x - first.x) / dt) * 1000, vy: ((last.y - first.y) / dt) * 1000 };
}

export function ServiceBoard({
  jobs,
  customers,
  users,
  shortages,
  showDelivered,
}: {
  jobs: ServiceJob[];
  customers: Customer[];
  users: User[];
  /** Job id → how many distinct parts it is short. */
  shortages: Record<string, number>;
  showDelivered: boolean;
}) {
  const { t, locale } = useLocale();
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<ServiceStatus | null>(null);

  const columnRefs = useRef(new Map<ServiceStatus, HTMLElement>());
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const dragState = useRef<DragState | null>(null);
  const flipQueue = useRef(new Map<string, FlipEntry>());
  const settleCancel = useRef(new Map<string, () => void>());
  const detachDragListeners = useRef<(() => void) | null>(null);

  useEffect(() => () => detachDragListeners.current?.(), []);

  // The card must land in its new column before the server round-trip, or a
  // drag feels broken on a slow connection.
  const [view, moveOptimistic] = useOptimistic(
    jobs,
    (state: ServiceJob[], move: { id: string; status: ServiceStatus }) =>
      state.map((j) => (j.id === move.id ? { ...j, status: move.status } : j)),
  );

  const columns = showDelivered ? ALL_STATUSES : COLUMNS;

  function move(id: string, status: ServiceStatus) {
    const job = view.find((j) => j.id === id);
    if (!job || job.status === status) return;
    startTransition(async () => {
      moveOptimistic({ id, status });
      await setJobStatus(id, status);
    });
  }

  function findColumnAt(x: number): ServiceStatus | null {
    for (const status of columns) {
      const el = columnRefs.current.get(status);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right) return status;
    }
    return null;
  }

  function cancelSettle(id: string) {
    settleCancel.current.get(id)?.();
    settleCancel.current.delete(id);
  }

  function handlePointerDown(e: React.PointerEvent, job: ServiceJob) {
    // Touch keeps the explicit move menu as its only path — a column row
    // scrolls horizontally on a phone, and a card that also claims touch
    // gestures would fight that scroll.
    if (e.pointerType === "touch" || (e.pointerType === "mouse" && e.button !== 0)) return;
    const el = cardRefs.current.get(job.id);
    if (!el) return;
    cancelSettle(job.id);
    const rect = el.getBoundingClientRect();
    dragState.current = {
      id: job.id,
      pointerId: e.pointerId,
      grabX: e.clientX - rect.left,
      grabY: e.clientY - rect.top,
      originLeft: rect.left,
      originTop: rect.top,
      samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }],
      committed: false,
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    detachDragListeners.current = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }

  function handlePointerMove(e: PointerEvent) {
    const state = dragState.current;
    if (!state || e.pointerId !== state.pointerId) return;
    const el = cardRefs.current.get(state.id);
    if (!el) return;

    state.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (state.samples.length > 8) state.samples.shift();

    if (!state.committed) {
      const first = state.samples[0];
      const dist = Math.hypot(e.clientX - first.x, e.clientY - first.y);
      if (dist < DRAG_THRESHOLD) return;
      state.committed = true;
      el.setPointerCapture(state.pointerId);
      setDragging(state.id);
      el.style.zIndex = "30";
      el.style.willChange = "transform";
    }
    e.preventDefault();

    // Origin was captured once at commit, before any transform — the offset
    // is derived from the pointer against that fixed point every frame, so
    // the card stays glued to the exact spot it was grabbed at, not its
    // center, and error never accumulates across frames.
    const dx = e.clientX - state.grabX - state.originLeft;
    const dy = e.clientY - state.grabY - state.originTop;
    el.style.transform = `translate(${dx}px, ${dy}px) scale(1.03)`;

    const column = findColumnAt(e.clientX);
    setOver((prev) => (prev === column ? prev : column));
  }

  function handlePointerUp(e: PointerEvent) {
    const state = dragState.current;
    if (!state || e.pointerId !== state.pointerId) return;
    detachDragListeners.current?.();
    detachDragListeners.current = null;
    dragState.current = null;

    const el = cardRefs.current.get(state.id);
    if (!state.committed || !el) {
      setDragging(null);
      setOver(null);
      return;
    }

    const { vx, vy } = velocityFromSamples(state.samples);
    const projectedX = e.clientX + project(vx);
    const target = findColumnAt(projectedX) ?? findColumnAt(e.clientX);

    const job = view.find((j) => j.id === state.id);
    const settling = job && target && target !== job.status;

    // Strip the drag scale before measuring — the settle animation only
    // carries position, so the "first" rect must be scale-free too.
    const rect = el.getBoundingClientRect();
    const dx = parseTranslateX(el.style.transform) ?? 0;
    const dy = parseTranslateY(el.style.transform) ?? 0;
    el.style.transform = `translate(${dx}px, ${dy}px)`;

    setDragging(null);
    setOver(null);

    if (settling) {
      flipQueue.current.set(state.id, { left: rect.left, top: rect.top, vx, vy });
      move(state.id, target);
    } else {
      settleTo(state.id, el, dx, dy, 0, 0, vx, vy);
    }
  }

  // Runs after every optimistic move commits, so a dropped card measures its
  // new slot the instant it exists in the DOM and flies there from wherever
  // the pointer left it — the FLIP technique, with the release velocity
  // carried straight into the spring instead of being discarded at drop.
  useLayoutEffect(() => {
    if (flipQueue.current.size === 0) return;
    for (const [id, first] of flipQueue.current) {
      const el = cardRefs.current.get(id);
      if (!el) continue;
      const last = el.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      el.style.zIndex = "30";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      settleTo(id, el, dx, dy, 0, 0, first.vx, first.vy);
    }
    flipQueue.current.clear();
  }, [view]);

  function settleTo(
    id: string,
    el: HTMLDivElement,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    vx: number,
    vy: number,
  ) {
    if (prefersReducedMotion()) {
      el.style.transform = "";
      el.style.zIndex = "";
      el.style.willChange = "";
      return;
    }
    let doneX = false;
    let doneY = false;
    const finish = () => {
      if (!doneX || !doneY) return;
      el.style.transform = "";
      el.style.zIndex = "";
      el.style.willChange = "";
      settleCancel.current.delete(id);
    };
    let x = fromX;
    let y = fromY;
    const apply = () => {
      el.style.transform = `translate(${x}px, ${y}px)`;
    };
    const cancelX = animateSpring({
      from: fromX,
      to: toX,
      velocity: vx,
      onUpdate: (v) => {
        x = v;
        apply();
      },
      onSettle: () => {
        doneX = true;
        finish();
      },
    });
    const cancelY = animateSpring({
      from: fromY,
      to: toY,
      velocity: vy,
      onUpdate: (v) => {
        y = v;
        apply();
      },
      onSettle: () => {
        doneY = true;
        finish();
      },
    });
    settleCancel.current.set(id, () => {
      cancelX();
      cancelY();
    });
  }

  return (
    <div
      className={cn(
        // Full-bleed on a phone so the columns can scroll past the page gutter.
        "-mx-4 lg:mx-0 px-4 lg:px-0 overflow-x-auto pb-2",
        "[scrollbar-width:thin]",
      )}
    >
      <div className="flex gap-3 items-start snap-x snap-mandatory lg:snap-none">
        {columns.map((status) => {
          const cards = view.filter((j) => j.status === status);
          return (
            <section
              key={status}
              ref={(el) => {
                if (el) columnRefs.current.set(status, el);
                else columnRefs.current.delete(status);
              }}
              className={cn(
                "shrink-0 snap-start w-[78vw] sm:w-64 lg:w-auto lg:flex-1 lg:min-w-0",
                "rounded-lg border bg-sunken/50 transition-colors",
                over === status ? "border-accent bg-accent-soft/50" : "border-line",
              )}
            >
              <div className="p-3 pb-2">
                <div className={cn("h-1 rounded-full mb-2.5", COLUMN_BAR[status])} />
                <div className="flex items-center gap-2">
                  <h3 className="text-2xs font-semibold truncate">{t(serviceKey(status))}</h3>
                  <span className="text-2xs text-faint shrink-0">
                    <Num>{formatNumber(cards.length, locale, 0)}</Num>
                  </span>
                </div>
              </div>

              {/* A tall column even when empty: a 0-item stage still has to be a
                  drop target big enough to aim a dragged card at. */}
              <div className="px-2 pb-2 flex flex-col gap-2 min-h-[350px]">
                {cards.length === 0 ? (
                  <div
                    className={cn(
                      "flex-1 grid place-items-center rounded-md border border-dashed",
                      "text-2xs text-faint text-center px-3 transition-colors",
                      over === status
                        ? "border-accent bg-accent-soft/60 text-accent"
                        : "border-line",
                    )}
                  >
                    {t("service.emptyColumn")}
                  </div>
                ) : (
                  cards.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      customers={customers}
                      users={users}
                      short={shortages[job.id] ?? 0}
                      dragging={dragging === job.id}
                      cardRef={(el) => {
                        if (el) cardRefs.current.set(job.id, el);
                        else cardRefs.current.delete(job.id);
                      }}
                      onPointerDown={(e) => handlePointerDown(e, job)}
                      onMove={move}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function parseTranslateX(transform: string): number | null {
  const m = /translate\(\s*(-?[\d.]+)px/.exec(transform);
  return m ? Number(m[1]) : null;
}

function parseTranslateY(transform: string): number | null {
  const m = /translate\([^,]+,\s*(-?[\d.]+)px/.exec(transform);
  return m ? Number(m[1]) : null;
}

function JobCard({
  job,
  customers,
  users,
  short,
  dragging,
  cardRef,
  onPointerDown,
  onMove,
}: {
  job: ServiceJob;
  customers: Customer[];
  users: User[];
  short: number;
  dragging: boolean;
  cardRef: (el: HTMLDivElement | null) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onMove: (id: string, status: ServiceStatus) => void;
}) {
  const { t, locale } = useLocale();
  const [menu, setMenu] = useState(false);

  const customer = customers.find((c) => c.id === job.customerId)?.name ?? "—";
  const tech = users.find((u) => u.id === job.technicianId);
  const age = daysBetween(job.date, today());

  return (
    <div
      ref={cardRef}
      onPointerDown={onPointerDown}
      className={cn(
        "relative bg-surface border border-line rounded-sm p-3 flex flex-col gap-2",
        "select-none touch-pan-y",
        dragging
          ? "shadow-pop cursor-grabbing"
          : "shadow-card hover:shadow-pop transition-shadow duration-[var(--dur-swift)] lg:cursor-grab",
      )}
    >
      <div className="flex items-start gap-2">
        <Link
          href={"/service/" + job.id}
          className="min-w-0 flex-1 hover:text-accent transition-colors"
        >
          <div className="text-xs font-semibold truncate">{job.machineLabel || customer}</div>
          <div className="text-2xs text-muted truncate">{customer}</div>
        </Link>
        {/* Touch has no drag, so every card also carries an explicit move menu. */}
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          aria-haspopup="menu"
          aria-expanded={menu}
          aria-label={t("service.moveTo")}
          className="shrink-0 grid place-items-center size-7 -m-1 rounded-sm text-faint hover:text-ink hover:bg-sunken transition-colors"
        >
          <IconChevronDown size={14} />
        </button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-2xs text-faint">
          <Num>{job.number}</Num>
        </span>
        <span className="text-2xs text-faint">·</span>
        <span className="text-2xs text-faint">{t("service.daysOpen", { d: countedPhrase(locale, "day", age) })}</span>
      </div>

      {(short > 0 || job.underWarranty || tech) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {short > 0 && (
            <Badge tone="warn">
              <IconAlert size={11} className="me-1" />
              {t("service.shortageOf", { n: short })}
            </Badge>
          )}
          {job.underWarranty && <Badge tone="muted">{t("label.warranty")}</Badge>}
          {job.parts.length > 0 && short === 0 && (
            <Badge tone="muted">
              <IconLayers size={11} className="me-1" />
              <Num>{job.parts.length}</Num>
            </Badge>
          )}
          {tech && <span className="text-2xs text-faint truncate">{tech.name}</span>}
        </div>
      )}

      {menu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} aria-hidden="true" />
          <div
            role="menu"
            className="anim-pop-end absolute z-40 top-9 end-2 w-44 bg-surface border border-line rounded-sm shadow-pop overflow-hidden"
          >
            <p className="px-3 pt-2 pb-1 text-2xs text-faint">{t("service.moveTo")}</p>
            {ALL_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                role="menuitemradio"
                aria-checked={s === job.status}
                onClick={() => {
                  setMenu(false);
                  onMove(job.id, s);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 h-9 text-2xs text-start transition-colors",
                  s === job.status ? "bg-accent-soft text-accent font-semibold" : "hover:bg-sunken",
                )}
              >
                <span className={cn("size-1.5 rounded-full shrink-0", COLUMN_BAR[s])} />
                <span className="flex-1 truncate">{t(serviceKey(s))}</span>
                {s === job.status && <IconCheck size={12} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
