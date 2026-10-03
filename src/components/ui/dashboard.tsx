import type { ReactNode } from "react";
import Link from "next/link";
import type { CurrencyCode } from "@/lib/data/types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Dot, Num, type Tone } from "./primitives";
import { ListCard, StatTile } from "./page";

/**
 * Dashboard building blocks.
 *
 * These used to be a second visual system — ring shadows, tinted head bands,
 * uppercase micro-labels — that made the landing page look unlike every page
 * behind it. They are now thin names over the shared kit, so the dashboard
 * and the pages it links to read as one product.
 */

/** The dashboard's KPI tile is the app's KPI tile. */
export const KpiTile = StatTile;

/** A titled card for the dashboard's chart and ranking panels. */
export function DashCard({
  title,
  meta,
  action,
  children,
  className,
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "border border-line bg-surface rounded-lg shadow-card flex flex-col min-w-0",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 min-h-12 py-2 hairline-b">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold truncate">{title}</h2>
          {meta && <p className="text-2xs text-faint truncate">{meta}</p>}
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-5 flex-1">{children}</div>
    </section>
  );
}

/**
 * A row of period links that set `?period=` — state lives in the URL, not in
 * component state, so refresh, sharing and Back/Forward all land on the same
 * view. A plain Segmented can't do this: it needs a client `onChange`, and
 * this toggle is read by a server component.
 */
export function PeriodToggle<T extends string>({
  options,
  value,
  param,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  param: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 p-0.5 rounded-sm border border-line bg-sunken no-print"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Link
            key={o.value}
            href={active ? "?" : `?${param}=${o.value}`}
            role="tab"
            aria-selected={active}
            scroll={false}
            className={cn(
              "h-8 px-3 grid place-items-center rounded-xs text-2xs font-medium transition-colors duration-[var(--dur-swift)]",
              active ? "bg-surface text-ink shadow-card font-semibold" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}

/** A queue card for the dashboard's "needs attention" band. */
export function AttentionCard({
  title,
  count,
  tone = "neutral",
  href,
  viewAllLabel,
  emptyTitle,
  children,
}: {
  title: string;
  count?: number;
  tone?: Tone;
  href?: string;
  viewAllLabel?: string;
  emptyTitle?: string;
  children?: ReactNode;
}) {
  return (
    <ListCard
      title={title}
      count={count}
      tone={tone}
      href={href}
      viewAllLabel={viewAllLabel}
      emptyTitle={emptyTitle}
    >
      {children}
    </ListCard>
  );
}

/**
 * One row inside an `AttentionCard`: the thing, and the single fact that
 * decides whether it needs you now — an amount, or a status dot.
 */
export function AttentionRow({
  href,
  title,
  subtitle,
  value,
  valueTone = "neutral",
  status,
  statusTone = "neutral",
}: {
  href: string;
  title: string;
  subtitle?: string;
  value?: string;
  valueTone?: "neutral" | "danger" | "warn" | "success";
  status?: string;
  statusTone?: Tone;
}) {
  const valueColor =
    valueTone === "danger"
      ? "text-danger"
      : valueTone === "warn"
        ? "text-warn"
        : valueTone === "success"
          ? "text-success"
          : "text-ink";

  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 px-4 sm:px-5 min-h-12 py-2 hover:bg-sunken active:bg-sunken transition-colors duration-[var(--dur-swift)]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium truncate">{title}</span>
          {subtitle && <span className="block text-2xs text-faint truncate">{subtitle}</span>}
        </span>
        {status && (
          <span className="text-2xs text-muted shrink-0">
            <Dot tone={statusTone}>{status}</Dot>
          </span>
        )}
        {value && (
          <Num className={cn("text-xs font-semibold shrink-0", valueColor)}>{value}</Num>
        )}
      </Link>
    </li>
  );
}

/** A ranked list: label and exact value on one line, a thin accent track beneath. */
export function RankedList({
  points,
  currency,
  locale,
}: {
  points: { label: string; value: number }[];
  currency: CurrencyCode;
  locale: string;
}) {
  const format = (n: number) => formatMoney(n, currency, locale);
  const max = Math.max(...points.map((p) => p.value), 1);

  return (
    <ol className="flex flex-col gap-4">
      {points.map((p, i) => (
        <li key={p.label + i}>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="text-xs text-ink truncate min-w-0">
              <span className="me-2"><Num className="text-faint">{i + 1}</Num></span>
              {p.label}
            </span>
            <Num className="text-xs font-semibold text-ink shrink-0">{format(p.value)}</Num>
          </div>
          <div className="h-1 bg-sunken rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full"
              style={{ width: `${Math.max((p.value / max) * 100, 1.5)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
