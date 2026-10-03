import type { ComponentType, ReactNode, SVGProps } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Badge, Dot, Num, type Tone } from "./primitives";

type IconType = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Retired: every page title is the same size now. Accepted and ignored. */
  size?: "default" | "hero";
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 mb-6 lg:mb-8">
      <div className="min-w-0">
        <h1 className="text-lg font-bold tracking-tight leading-tight text-balance">{title}</h1>
        {subtitle && <p className="text-xs text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0 no-print">{actions}</div>
      )}
    </header>
  );
}

/**
 * A KPI tile.
 *
 * Reading order is label → figure → verdict. The figure is always ink: a
 * tile is read for its number, and a number painted red or green competes
 * with the badges in the table below it. Whether the number is a problem is
 * carried by `chip`, drawn as a status dot in the tile's tone on the meta
 * line — the same vocabulary a dense table uses.
 *
 * The icon is a quiet wayfinding glyph, not a status: it never takes a tone.
 */
export function StatTile({
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
  icon?: IconType;
  /** Short verdict — "needs a look", "overdue". Omit when there is nothing to say. */
  chip?: string;
  /** Makes the whole tile a link to the page that resolves it. */
  href?: string;
}) {
  const hasDelta = typeof delta === "number" && Number.isFinite(delta);

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-2xs font-medium text-muted leading-snug line-clamp-2">{label}</span>
        {TileIcon && <TileIcon size={16} className="text-faint shrink-0 mt-0.5" aria-hidden="true" />}
      </div>

      {/* self-start: shrink to the figure and sit at the reading edge. Stretched
          to the card's width, an LTR-isolated number aligns to the physical
          left — right for Turkish, wrong for Arabic. */}
      <Num className="self-start text-xl sm:text-2xl font-bold tracking-tight text-ink">{value}</Num>

      {/* Always rendered, so every tile's figure sits on the same line
          whether or not it has anything to say underneath. */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs min-h-5 mt-auto">
          {chip && (
            <span className="font-medium text-ink">
              <Dot tone={tone === "neutral" ? "muted" : tone}>{chip}</Dot>
            </span>
          )}
          {hasDelta && (
            <Num
              className={cn(
                "font-semibold",
                delta! > 0 ? "text-success" : delta! < 0 ? "text-danger" : "text-faint",
              )}
            >
              {delta! > 0 ? "▲ " : delta! < 0 ? "▼ " : ""}
              {Math.abs(delta!).toFixed(1)}%
            </Num>
          )}
          {meta && <span className="text-faint min-w-0 truncate">{meta}</span>}
      </div>
    </>
  );

  const shell = cn(
    "flex flex-col gap-2.5 min-w-0 min-h-[7.5rem] rounded-lg border border-line bg-surface shadow-card p-4 sm:p-5",
    "transition-[border-color,background-color] duration-[var(--dur-swift)]",
    href && "hover:border-line-strong hover:bg-sunken/30",
  );

  return href ? (
    <Link href={href} className={shell}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

/**
 * A card whose body is a short list of things to act on, with a link to the
 * full page at the foot. The dashboard is built out of these: each one is a
 * queue you can empty, not a report you have to read.
 */
export function ListCard({
  title,
  count,
  tone = "neutral",
  icon: CardIcon,
  href,
  viewAllLabel,
  emptyTitle,
  children,
}: {
  title: string;
  /** How many are waiting in total — may be more than the rows shown. */
  count?: number;
  tone?: Tone;
  icon?: IconType;
  /** The page that lists all of them. */
  href?: string;
  viewAllLabel?: string;
  emptyTitle?: string;
  children?: ReactNode;
}) {
  const isEmpty = !children || (Array.isArray(children) && children.length === 0);

  return (
    <div className="border border-line bg-surface rounded-lg shadow-card flex flex-col min-w-0">
      <div className="flex items-center gap-2.5 px-4 sm:px-5 h-12 hairline-b shrink-0">
        {CardIcon && <CardIcon size={16} className="text-faint shrink-0" aria-hidden="true" />}
        <h2 className="text-sm font-semibold truncate flex-1">{title}</h2>
        {typeof count === "number" && count > 0 && (
          <Badge tone={tone === "neutral" ? "muted" : tone}>
            <Num>{count}</Num>
          </Badge>
        )}
      </div>

      <div className="flex-1">
        {isEmpty ? (
          <EmptyState compact title={emptyTitle ?? ""} />
        ) : (
          <ul className="divide-y divide-line">{children}</ul>
        )}
      </div>

      {href && !isEmpty && (
        <Link
          href={href}
          className="hairline-t h-11 flex items-center px-4 sm:px-5 text-2xs font-semibold text-accent hover:bg-sunken transition-colors rounded-b-lg"
        >
          {viewAllLabel}
        </Link>
      )}
    </div>
  );
}

/**
 * One actionable row inside a ListCard: what it is, why it needs you, and how
 * much. The whole row is the hit target — 48px, comfortably over the minimum.
 */
export function ListRow({
  href,
  title,
  subtitle,
  value,
  valueTone = "neutral",
  badge,
}: {
  href: string;
  title: string;
  subtitle?: string;
  value?: string;
  valueTone?: "neutral" | "danger" | "warn" | "success";
  badge?: ReactNode;
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
        className="flex items-center gap-3 px-4 h-12 hover:bg-sunken active:bg-sunken transition-colors duration-[var(--dur-swift)]"
      >
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium truncate">
            <span className="[unicode-bidi:plaintext]">{title}</span>
          </div>
          {subtitle && <div className="text-2xs text-faint truncate">{subtitle}</div>}
        </div>
        {badge}
        {value && (
          <Num className={cn("text-xs font-semibold shrink-0", valueColor)}>{value}</Num>
        )}
      </Link>
    </li>
  );
}

export function EmptyState({
  title,
  hint,
  action,
  compact,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center gap-2",
        compact ? "py-10" : "py-20",
      )}
    >
      <p className="text-xs font-medium text-muted">{title}</p>
      {hint && <p className="text-2xs text-faint max-w-72 leading-relaxed">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Filter/search strip that sits above a table. */
export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 no-print">{children}</div>
  );
}

/** A labelled read-only value, used across the detail pages. */
export function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-xs">
      <span className="text-muted shrink-0">{label}</span>
      <span className="text-ink text-end min-w-0 truncate">
        {/* Inline isolate: see the matching note in DataTable. */}
        <span className="[unicode-bidi:plaintext]">{children}</span>
      </span>
    </div>
  );
}
