"use client";

import { useId, useState } from "react";
import type { CurrencyCode } from "@/lib/data/types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

export interface TrendPoint {
  /** Full label for the tooltip and the accessible name — "سبتمبر 26". */
  label: string;
  /** Short axis tick — the month name alone. Falls back to `label`. */
  tick?: string;
  value: number;
  meta?: string;
  /** Draws this bar in the accent instead of the pale tint. */
  highlight?: boolean;
}

/**
 * A vertical bar chart: most months sit in a pale accent tint and the ones
 * worth noticing — the current month, the peak — are drawn solid so the shape
 * reads before the numbers do.
 *
 * Charts stay left-to-right even in Arabic, same reasoning as `LineChart`:
 * mirroring a time axis makes it harder to compare against a printed report.
 *
 * Split into its own client file because the hover state needs `useState`;
 * everything else in `ui/dashboard.tsx` renders on the server.
 */
export function TrendBars({
  points,
  height = 200,
  currency,
  locale,
}: {
  points: TrendPoint[];
  height?: number;
  currency: CurrencyCode;
  locale: string;
}) {
  const money = (n: number) => formatMoney(n, currency, locale);
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();

  const max = Math.max(...points.map((p) => p.value), 1);
  const dense = points.length > 8;

  return (
    <div dir="ltr" className="select-none">
      <div
        className="relative flex items-end gap-1 sm:gap-2 border-b border-line"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
      >
        {points.map((p, i) => {
          const pct = p.value > 0 ? Math.max((p.value / max) * 100, 2) : 0;
          const isActive = hover === i;
          const solid = p.highlight || isActive;
          // Keep the tooltip inside the card at both ends of the axis.
          const anchor =
            i < 2 ? "start-0" : i > points.length - 3 ? "end-0" : "start-1/2 -translate-x-1/2";
          return (
            <button
              key={id + p.label + i}
              type="button"
              aria-label={`${p.label}: ${money(p.value)}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="relative flex-1 h-full flex items-end group cursor-default focus-visible:outline-offset-2"
            >
              <span
                className={cn(
                  "w-full rounded-t-xs transition-colors duration-[var(--dur-swift)]",
                  solid ? "bg-accent" : "bg-accent-line/60 group-hover:bg-accent-line",
                )}
                style={{ height: `${pct}%` }}
              />
              {isActive && (
                <div className={cn("absolute z-10 bottom-full mb-2 pointer-events-none", anchor)}>
                  <div
                    dir={locale === "ar" ? "rtl" : "ltr"}
                    className="bg-ink text-white rounded-sm shadow-pop px-3 py-2 whitespace-nowrap text-start"
                  >
                    <div className="text-2xs opacity-75">{p.label}</div>
                    <div className="text-xs font-semibold num">{money(p.value)}</div>
                    {p.meta && <div className="text-2xs opacity-75">{p.meta}</div>}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex gap-1 sm:gap-2 mt-2.5">
        {points.map((p, i) => (
          <span
            key={p.label + i}
            className={cn(
              // Labels may spill into their neighbours' slots: on a phone
              // those neighbours are hidden, and a clipped "سبتمبر" reads
              // worse than an overlapping one never would.
              "flex-1 min-w-0 flex justify-center text-2xs whitespace-nowrap",
              hover === i || p.highlight ? "text-ink font-semibold" : "text-faint",
              // Twelve Arabic month names do not fit a phone: label every
              // third, counting from the newest so the current month keeps its.
              dense && (points.length - 1 - i) % 3 !== 0 && "invisible md:visible",
            )}
          >
            {p.tick ?? p.label}
          </span>
        ))}
      </div>
    </div>
  );
}
