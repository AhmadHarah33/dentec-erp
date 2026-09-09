"use client";

import { useId, useState } from "react";
import type { CurrencyCode } from "@/lib/data/types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

export interface TrendPoint {
  label: string;
  value: number;
  meta?: string;
  /** Draws this bar in solid ink instead of the sunken tint. */
  highlight?: boolean;
}

/**
 * A bold vertical bar chart: most months sit in a light, sunken tint and the
 * ones worth noticing — the current month, the peak — are drawn solid so the
 * shape reads before the numbers do.
 *
 * Charts stay left-to-right even in Arabic, same reasoning as `LineChart`:
 * mirroring a time axis makes it harder to compare against a printed report.
 *
 * Split into its own client file because the hover state needs `useState`;
 * everything else in `ui/dashboard.tsx` renders on the server, and a shared
 * "use client" directive would have forced icon-component props there to
 * cross the server/client boundary as functions, which React cannot do.
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

  return (
    <div dir="ltr" className="select-none">
      <div
        className="flex items-end gap-1.5 sm:gap-2"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
      >
        {points.map((p, i) => {
          const pct = Math.max((p.value / max) * 100, 2);
          const isActive = hover === i;
          const solid = p.highlight || isActive;
          return (
            <button
              key={id + p.label + i}
              type="button"
              aria-label={`${p.label}: ${money(p.value)}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              className="relative flex-1 h-full flex items-end group cursor-default"
            >
              <span
                className={cn(
                  "w-full rounded-t-xs transition-colors duration-[var(--dur-swift)]",
                  solid ? "bg-ink" : "bg-sunken group-hover:bg-line-strong",
                )}
                style={{ height: `${pct}%` }}
              />
              {isActive && (
                <div className="absolute z-10 bottom-full mb-2 start-1/2 -translate-x-1/2 pointer-events-none">
                  <div className="bg-ink text-white rounded-sm shadow-pop px-3 py-2 whitespace-nowrap">
                    <div className="text-2xs opacity-70">{p.label}</div>
                    <div className="text-xs font-semibold num">{money(p.value)}</div>
                    {p.meta && <div className="text-2xs opacity-70">{p.meta}</div>}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex gap-1.5 sm:gap-2 mt-3">
        {points.map((p, i) => (
          <span
            key={p.label + i}
            className={cn(
              "flex-1 text-center text-2xs num transition-colors truncate",
              hover === i || p.highlight ? "text-ink font-semibold" : "text-faint",
              points.length > 8 && i % 2 === 1 && "hidden sm:inline",
            )}
          >
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}
