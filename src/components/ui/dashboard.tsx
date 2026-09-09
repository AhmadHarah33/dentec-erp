import type { ComponentType, ReactNode, SVGProps } from "react";
import Link from "next/link";
import type { CurrencyCode } from "@/lib/data/types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Badge, Dot, Num, TONE_TINT, type Tone } from "./primitives";
import { EmptyState } from "./page";

/**
 * Dashboard-only surface. Cards elsewhere in the app separate with a 1px
 * hairline; the dashboard's headline cards trade that for a "shadow as
 * border" — a crisp ring plus a soft fall (`shadow-ring`, globals.css) — so
 * the edge stays sharp at any zoom without adding a third elevation step.
 * Kept out of the shared `Card` so the rest of the app is untouched.
 */
function dashSurface(className?: string) {
  return cn("border border-transparent bg-surface rounded-lg shadow-ring", className);
}

/**
 * A KPI tile in the dashboard's own voice: an uppercase micro-label, a big
 * tabular value, and the verdict as a filled pill — never plain coloured
 * text, per the app's "a status never picks its own colour" rule.
 *
 * Same prop shape as `StatTile` on purpose, so the dashboard could always
 * fall back to the shared tile with a one-line swap.
 */
export function KpiTile({
  label,
  value,
  meta,
  delta,
  tone = "neutral",
  icon: TileIcon,
  chip,
  href,
}: {
  label: string;
  value: string;
  meta?: string;
  delta?: number;
  tone?: Tone;
  icon?: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  chip?: string;
  href?: string;
}) {
  const pillTone: Tone | undefined =
    typeof delta === "number" && Number.isFinite(delta)
      ? delta > 0
        ? "success"
        : delta < 0
          ? "danger"
          : "muted"
      : chip
        ? tone === "neutral"
          ? "muted"
          : tone
        : undefined;

  const pillLabel =
    typeof delta === "number" && Number.isFinite(delta)
      ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`
      : chip;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {TileIcon && (
            <span className={cn("grid place-items-center size-8 rounded-sm shrink-0", TONE_TINT[tone])}>
              <TileIcon size={16} />
            </span>
          )}
          <span className="text-2xs font-semibold tracking-wide uppercase text-faint truncate">
            {label}
          </span>
        </div>
        {pillLabel && (
          <Badge tone={pillTone} className="shrink-0">
            <Num>{pillLabel}</Num>
          </Badge>
        )}
      </div>

      <span className="text-3xl font-bold tracking-tight leading-none text-ink">
        <Num>{value}</Num>
      </span>

      {meta && <span className="text-2xs text-faint truncate">{meta}</span>}
    </>
  );

  const shell = cn(
    dashSurface("p-4 flex flex-col gap-3"),
    "transition-transform duration-[var(--dur-swift)]",
    href && "hover:shadow-pop active:scale-[0.99]",
  );

  return href ? (
    <Link href={href} className={shell}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

/** Section chrome for the dashboard's chart/ranking cards — shadow-ring, no hairline header. */
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
    <div className={dashSurface(cn("flex flex-col min-w-0", className))}>
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold truncate">{title}</h2>
          {meta && <p className="text-2xs text-faint mt-0.5 truncate">{meta}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
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
      className="inline-flex items-center gap-0.5 p-0.5 rounded-full border border-line bg-sunken no-print"
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
              "h-8 px-3.5 grid place-items-center rounded-full text-2xs font-medium transition-colors duration-[var(--dur-swift)]",
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

/**
 * A queue card for the dashboard's "needs attention" band — one line per
 * item, one number or status per line. The old attention cards (icon square,
 * a tone-coloured count chip, a subtitle under every title) read as busy at
 * four rows; this keeps only what decides whether to click through.
 */
export function AttentionCard({
  title,
  count,
  href,
  viewAllLabel,
  emptyTitle,
  children,
}: {
  title: string;
  /** Shown as a quiet number beside the title, not a coloured chip. */
  count?: number;
  href?: string;
  viewAllLabel?: string;
  emptyTitle?: string;
  children?: ReactNode;
}) {
  const isEmpty = !children || (Array.isArray(children) && children.length === 0);

  return (
    <div className={dashSurface("flex flex-col overflow-hidden")}>
      {/* A tinted head band, so the card's name reads as a label on the card
          rather than the first line inside it. */}
      <div className="flex items-center justify-between gap-3 px-5 h-12 bg-accent-soft border-b border-accent-line shrink-0">
        <h2 className="text-xs font-semibold text-accent-strong truncate">{title}</h2>
        {typeof count === "number" && count > 0 && (
          <span className="text-2xs font-semibold text-accent shrink-0">
            <Num>{count}</Num>
          </span>
        )}
      </div>

      <div className="flex-1 px-5 pt-3">
        {isEmpty ? (
          <EmptyState compact title={emptyTitle ?? ""} />
        ) : (
          <ul className="divide-y divide-line/70">{children}</ul>
        )}
      </div>

      {href && !isEmpty && (
        <Link
          href={href}
          className="mx-5 mt-1 mb-4 pt-3 text-2xs font-medium text-accent hover:text-accent-strong transition-colors duration-[var(--dur-swift)]"
        >
          {viewAllLabel}
        </Link>
      )}
    </div>
  );
}

/**
 * One row inside an `AttentionCard`: the thing, and the single fact that
 * decides whether it needs you now — an amount, or a status dot. Never both,
 * and never a second, quieter line under the title — that pairing is exactly
 * what made the old cards feel dense.
 */
export function AttentionRow({
  href,
  title,
  value,
  valueTone = "neutral",
  status,
  statusTone = "neutral",
}: {
  href: string;
  title: string;
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
          : "text-muted";

  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 py-3 hover:opacity-70 active:opacity-60 transition-opacity duration-[var(--dur-swift)]"
      >
        <span className="min-w-0 flex-1 text-xs font-medium truncate">{title}</span>
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

/**
 * A ranked list in the "Traffic Sources" idiom: uppercase tracked label and
 * value on one line, a thin ink-coloured track beneath. Kept apart from the
 * shared `BarList` (accent-blue track, used on Reports too) so this look
 * stays scoped to the dashboard.
 */
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
    <ul className="flex flex-col">
      {points.map((p, i) => (
        <li key={p.label + i} className="py-2.5 first:pt-0 last:pb-0">
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="text-2xs font-semibold tracking-wide uppercase text-muted truncate min-w-0">
              {p.label}
            </span>
            <Num className="text-xs font-semibold text-ink shrink-0">{format(p.value)}</Num>
          </div>
          <div className="h-1.5 bg-sunken rounded-full overflow-hidden">
            <div
              className="h-full bg-ink rounded-full"
              style={{ width: `${Math.max((p.value / max) * 100, 1.5)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
