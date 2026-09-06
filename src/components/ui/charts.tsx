"use client";

import { useId, useState } from "react";
import type { CurrencyCode } from "@/lib/data/types";
import { formatMoney, formatNumberCompact } from "@/lib/money";
import { cn } from "@/lib/cn";

export interface Point {
  label: string;
  value: number;
  /** Optional second line in the tooltip. */
  meta?: string;
}

/**
 * A trend line with a readable value axis.
 *
 * Charts stay left-to-right even in Arabic. Time reading right-to-left is not
 * a convention users of dashboards expect, and mirroring the axis makes a
 * trend line harder to compare against printed reports.
 *
 * The plot is deliberately split in two: the SVG stretches horizontally to
 * fill whatever width the card gives it (`preserveAspectRatio="none"`), while
 * the dots, tick labels and tooltip are HTML positioned on top. Drawing the
 * dots inside that stretched viewBox would render them as ellipses; the
 * vertical axis is 1:1 with pixels, so an overlay can place them exactly.
 *
 * Tick labels sit on their gridline rather than in a gutter column, which
 * keeps the time axis below in step with the plot at any width.
 */
export function LineChart({
  points,
  height = 220,
  currency,
  locale,
}: {
  points: Point[];
  height?: number;
  currency: CurrencyCode;
  locale: string;
}) {
  // Formatting is done here rather than via a prop: a function cannot cross
  // the server-to-client boundary, and every caller of this chart is a server
  // component.
  const money = (n: number) => formatMoney(n, currency, locale);
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();

  const W = 600;
  const padTop = 24;
  const padBottom = 10;
  const innerH = height - padTop - padBottom;
  /**
   * Width reserved for the value labels. The plot is inset by it so a tick
   * never sits under the first data point, and so the dots at 0% and 100% —
   * which are drawn centred on the edge — have room instead of being clipped
   * in half by the container.
   */
  const GUTTER = 56;

  // Always anchor at zero: a truncated axis exaggerates every movement.
  const max = niceCeiling(Math.max(...points.map((p) => p.value), 1));

  /** Horizontal position as a percentage, so the overlay tracks the stretch. */
  const x = (i: number) => (points.length === 1 ? 50 : (i / (points.length - 1)) * 100);
  /** Vertical position in pixels — the viewBox is 1:1 on this axis. */
  const y = (v: number) => padTop + innerH - (v / max) * innerH;

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(x(i) / 100) * W},${y(p.value)}`)
    .join(" ");
  const area = `${line} L${W},${padTop + innerH} L0,${padTop + innerH} Z`;

  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => max * f);
  const active = hover !== null ? points[hover] : null;

  return (
    <div dir="ltr" className="select-none">
      <div
        className="relative"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
      >
        {/* Without these the line is a shape, not a measurement. */}
        {ticks.map((v) => (
          <span
            key={v}
            className="absolute left-0 text-2xs text-faint num pointer-events-none leading-none"
            style={{ top: y(v) - 14 }}
          >
            {formatNumberCompact(v, locale)}
          </span>
        ))}

        <div className="absolute inset-y-0 end-0" style={{ insetInlineStart: GUTTER }}>
        <svg
          viewBox={`0 0 ${W} ${height}`}
          className="absolute inset-0 w-full"
          style={{ height }}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((v, i) => (
            <line
              key={v}
              x1={0}
              x2={W}
              y1={y(v)}
              y2={y(v)}
              stroke={
                i === ticks.length - 1 ? "var(--color-line-strong)" : "var(--color-line)"
              }
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {hover !== null && (
            <line
              x1={(x(hover) / 100) * W}
              x2={(x(hover) / 100) * W}
              y1={padTop}
              y2={padTop + innerH}
              stroke="var(--color-accent)"
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Dots are HTML so they stay round however wide the card gets. */}
        {points.map((p, i) => (
          <span
            key={p.label + i}
            className={cn(
              "absolute rounded-full border-2 border-accent pointer-events-none",
              "-translate-x-1/2 -translate-y-1/2 transition-all duration-150",
              hover === i ? "size-3 bg-accent" : "size-2 bg-surface",
              hover !== null && hover !== i && "opacity-40",
            )}
            style={{ left: `${x(i)}%`, top: y(p.value) }}
          />
        ))}

        {/* One full-height hit area per point — a 2px line is not a target. */}
        <div className="absolute inset-0 flex">
          {points.map((p, i) => (
            <button
              key={p.label + i}
              type="button"
              tabIndex={-1}
              aria-label={`${p.label}: ${money(p.value)}`}
              className="flex-1 h-full cursor-default"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
            />
          ))}
        </div>

        {active && (
          <div
            className="absolute z-10 -translate-x-1/2 pointer-events-none"
            // Clamped so a tooltip on the first or last month stays in the card.
            style={{
              left: `${Math.min(Math.max(x(hover as number), 14), 86)}%`,
              top: Math.max(y(active.value) - 14, 6),
            }}
          >
            <div className="-translate-y-full bg-ink text-white rounded-sm shadow-pop px-3 py-2 whitespace-nowrap">
              <div className="text-2xs opacity-70">{active.label}</div>
              <div className="text-xs font-semibold num">{money(active.value)}</div>
              {active.meta && <div className="text-2xs opacity-70">{active.meta}</div>}
            </div>
          </div>
        )}
        </div>
      </div>

      <div className="flex justify-between mt-3" style={{ paddingInlineStart: GUTTER }}>
        {points.map((p, i) => (
          <span
            key={p.label + i}
            className={cn(
              "text-2xs num transition-colors",
              hover === i ? "text-ink font-semibold" : "text-faint",
              // Twelve labels at 13px will not fit a phone, and only just fit
              // a full-width desktop card, so a long series thins in three
              // steps: every fourth tick, every second, then all of them.
              points.length > 8 && labelTier(i),
            )}
          >
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Which breakpoint a time-axis label appears at. Index 0, 4, 8 … are always
 * shown; 2, 6, 10 … join at `sm`; the odd ones only when there is room for
 * every label.
 */
function labelTier(i: number): string | false {
  if (i % 2 === 1) return "hidden 2xl:inline";
  if (i % 4 !== 0) return "hidden sm:inline";
  return false;
}

/**
 * Round an axis maximum up to a number a person would have chosen — 1, 2, 2.5
 * or 5 times a power of ten — so every tick reads as a round figure.
 */
function niceCeiling(n: number): number {
  if (n <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(n));
  const scaled = n / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Horizontal bars — for rankings, where the label needs room to breathe. */
export function BarList({
  points,
  currency,
  locale,
  max: maxOverride,
}: {
  points: Point[];
  currency: CurrencyCode;
  locale: string;
  max?: number;
}) {
  const format = (n: number) => formatMoney(n, currency, locale);
  const max = maxOverride ?? Math.max(...points.map((p) => p.value), 1);

  return (
    <ul className="flex flex-col">
      {points.map((p, i) => (
        <li key={p.label + i} className="py-2 first:pt-0 last:pb-0">
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="text-xs truncate min-w-0">{p.label}</span>
            <span className="text-xs num font-medium text-muted shrink-0">{format(p.value)}</span>
          </div>
          <div className="h-2 bg-sunken rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full"
              style={{ width: `${Math.max((p.value / max) * 100, 1.5)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A stacked proportion bar, used for the aging summary. */
export function StackBar({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="flex h-2.5 rounded-full overflow-hidden bg-sunken">
      {segments.map((s) => (
        <div
          key={s.label}
          title={s.label}
          style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
        />
      ))}
    </div>
  );
}
