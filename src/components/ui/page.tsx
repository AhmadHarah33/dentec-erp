import type { ComponentType, ReactNode, SVGProps } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Badge, Num, TONE_TINT, type Tone } from "./primitives";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 no-print">{actions}</div>}
    </header>
  );
}

/**
 * A KPI tile.
 *
 * The tile answers two questions at once: what the number is, and whether it
 * is a problem. The chip and the tinted icon carry the second answer, so the
 * tile can be judged without reading the label.
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
  /** Shown in a tinted square that takes the tile's tone. */
  icon?: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  /** Short verdict — "needs a look", "overdue". Omit when the tile is fine. */
  chip?: string;
  /** Makes the whole tile a link to the page that resolves it. */
  href?: string;
}) {
  const valueColor =
    tone === "danger"
      ? "text-danger"
      : tone === "warn"
        ? "text-warn"
        : tone === "success"
          ? "text-success"
          : "text-ink";

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        {TileIcon && (
          <span
            className={cn(
              "grid place-items-center size-9 rounded-sm shrink-0",
              TONE_TINT[tone],
            )}
          >
            <TileIcon size={18} />
          </span>
        )}
        {chip && (
          <Badge tone={tone === "neutral" ? "muted" : tone}>{chip}</Badge>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-2xs font-medium text-muted">{label}</span>
        <span className={cn("text-2xl font-bold tracking-tight leading-none", valueColor)}>
          <Num>{value}</Num>
        </span>
      </div>

      <div className="flex items-center gap-2 min-h-5">
        {typeof delta === "number" && Number.isFinite(delta) && (
          <span
            className={cn(
              "text-2xs font-semibold",
              delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-faint",
            )}
          >
            <Num>
              {delta > 0 ? "+" : ""}
              {delta.toFixed(1)}%
            </Num>
          </span>
        )}
        {meta && <span className="text-2xs text-faint truncate">{meta}</span>}
      </div>
    </>
  );

  const shell = cn(
    "border border-line bg-surface rounded-lg shadow-card p-4",
    "flex flex-col gap-3 transition-colors",
    href && "hover:border-line-strong hover:bg-sunken/40",
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
  icon,
  href,
  viewAllLabel,
  emptyTitle,
  children,
}: {
  title: string;
  /** Shown as a chip beside the title — how many are waiting in total. */
  count?: number;
  tone?: Tone;
  icon?: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  /** The page that lists all of them. */
  href?: string;
  viewAllLabel?: string;
  emptyTitle?: string;
  children?: ReactNode;
}) {
  const CardIcon = icon;
  const isEmpty = !children || (Array.isArray(children) && children.length === 0);

  return (
    <div className="border border-line bg-surface rounded-lg shadow-card flex flex-col">
      <div className="flex items-center gap-2.5 px-4 h-12 hairline-b">
        {CardIcon && (
          <span className={cn("grid place-items-center size-7 rounded-xs shrink-0", TONE_TINT[tone])}>
            <CardIcon size={15} />
          </span>
        )}
        <h2 className="text-sm font-semibold truncate">{title}</h2>
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
          className="hairline-t h-11 grid place-items-center text-2xs font-semibold text-accent hover:bg-accent-soft/60 transition-colors rounded-b-lg"
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
        className="flex items-center gap-3 px-4 h-12 hover:bg-sunken transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium truncate">{title}</div>
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
      <span className="text-ink text-end min-w-0 truncate">{children}</span>
    </div>
  );
}
