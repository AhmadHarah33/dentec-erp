"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useLocale } from "@/lib/i18n/context";
import type { Customer, ServiceJob, ServiceStatus, User } from "@/lib/data/types";
import { serviceKey } from "@/lib/labels";
import { daysBetween, today } from "@/lib/dates";
import { formatNumber } from "@/lib/money";
import { setJobStatus } from "@/app/actions/service";
import { Badge, Num } from "@/components/ui/primitives";
import { IconAlert, IconChevronDown, IconCheck, IconLayers } from "@/components/ui/icons";

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

  // The card must land in its new column before the server round-trip, or a
  // drag feels broken on a slow connection.
  const [view, moveOptimistic] = useOptimistic(
    jobs,
    (state: ServiceJob[], move: { id: string; status: ServiceStatus }) =>
      state.map((j) => (j.id === move.id ? { ...j, status: move.status } : j)),
  );

  function move(id: string, status: ServiceStatus) {
    const job = view.find((j) => j.id === id);
    if (!job || job.status === status) return;
    startTransition(async () => {
      moveOptimistic({ id, status });
      await setJobStatus(id, status);
    });
  }

  const columns = showDelivered ? ALL_STATUSES : COLUMNS;

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
              onDragOver={(e) => {
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((s) => (s === status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain") || dragging;
                if (id) move(id, status);
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

              <div className="px-2 pb-2 flex flex-col gap-2 min-h-24">
                {cards.length === 0 ? (
                  <p className="text-2xs text-faint text-center py-6">
                    {t("service.emptyColumn")}
                  </p>
                ) : (
                  cards.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      customers={customers}
                      users={users}
                      short={shortages[job.id] ?? 0}
                      dragging={dragging === job.id}
                      onDragStart={() => setDragging(job.id)}
                      onDragEnd={() => setDragging(null)}
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

function JobCard({
  job,
  customers,
  users,
  short,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  job: ServiceJob;
  customers: Customer[];
  users: User[];
  short: number;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (id: string, status: ServiceStatus) => void;
}) {
  const { t } = useLocale();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const customer = customers.find((c) => c.id === job.customerId)?.name ?? "—";
  const tech = users.find((u) => u.id === job.technicianId);
  const age = daysBetween(job.date, today());

  return (
    <div
      ref={ref}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", job.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "relative bg-surface border border-line rounded-sm p-3 flex flex-col gap-2",
        "transition-[opacity,box-shadow,transform] duration-[var(--dur-swift)]",
        "lg:cursor-grab active:cursor-grabbing",
        dragging ? "opacity-50 shadow-pop scale-[.98]" : "shadow-card hover:shadow-pop",
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
        {/* Touch has no drag, so every card carries an explicit move menu. */}
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
        <span className="text-2xs text-faint">{t("service.daysOpen", { n: age })}</span>
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
            className="anim-pop absolute z-40 top-9 end-2 w-44 bg-surface border border-line rounded-sm shadow-pop overflow-hidden"
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
