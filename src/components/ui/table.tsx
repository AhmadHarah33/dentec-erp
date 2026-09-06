"use client";

import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/context";
import { Button, Input } from "./primitives";
import { EmptyState } from "./page";
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronEnd,
  IconChevronStart,
  IconSearch,
} from "./icons";

export interface Column<T> {
  key: string;
  header: string;
  /** Numbers and dates go at the inline end; text stays at the start. */
  align?: "start" | "end" | "center";
  /** Sort key. Omit to make the column unsortable. */
  sort?: (row: T) => string | number;
  /** Extra text this column contributes to the free-text search. */
  search?: (row: T) => string;
  render: (row: T) => ReactNode;
  width?: string;
  /**
   * Column priority. A table should show the four or five columns you actually
   * scan; the rest are one row-click away on the detail page.
   *
   *   (default)        always visible
   *   secondary: true  hidden below `md` — useful on a phone, not essential
   *   tertiary: true   hidden below `xl` — reference data, rarely scanned
   */
  secondary?: boolean;
  tertiary?: boolean;
}

/** The responsive class for a column's priority. */
function priorityClass<T>(c: Column<T>): string | false {
  if (c.tertiary) return "hidden xl:table-cell";
  if (c.secondary) return "hidden md:table-cell";
  return false;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /**
   * Row click handler. Every list in this app opens a drawer over the list
   * rather than navigating, so this is how a row becomes interactive.
   */
  onRowClick?: (row: T) => void;
  searchable?: boolean;
  filters?: ReactNode;
  emptyTitle?: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
  pageSize?: number;
  /** Rendered under the last row — totals, notes. */
  footer?: ReactNode;
  dense?: boolean;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  searchable = true,
  filters,
  emptyTitle,
  emptyHint,
  emptyAction,
  pageSize = 25,
  footer,
  dense,
}: Props<T>) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [asc, setAsc] = useState(true);
  const [page, setPage] = useState(0);

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((c) => {
        const text = c.search?.(row);
        return text ? text.toLowerCase().includes(q) : false;
      }),
    );
  }, [rows, query, columns]);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sort) return searched;
    const copy = [...searched];
    copy.sort((a, b) => {
      const av = col.sort!(a);
      const bv = col.sort!(b);
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return asc ? cmp : -cmp;
    });
    return copy;
  }, [searched, sortKey, asc, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(true);
    }
    setPage(0);
  }

  const hasControls = searchable || filters;

  return (
    <div>
      {hasControls && (
        <div className="flex flex-wrap items-center gap-2 mb-4 no-print">
          {searchable && (
            <div className="relative w-full max-w-64">
              <IconSearch className="absolute start-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder={t("msg.searchPlaceholder")}
                className="ps-9"
                aria-label={t("action.search")}
              />
            </div>
          )}
          {filters}
          <span className="text-2xs text-faint ms-auto num">
            {t("msg.rowsCount", { n: sorted.length })}
          </span>
        </div>
      )}

      <div className="border border-line bg-surface rounded-lg shadow-card overflow-hidden min-w-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="hairline-b bg-sunken/60">
                {columns.map((c) => {
                  const active = sortKey === c.key;
                  return (
                    <th
                      key={c.key}
                      style={c.width ? { width: c.width } : undefined}
                      className={cn(
                        "h-12 px-4 font-semibold text-2xs text-muted whitespace-nowrap",
                        c.align === "end"
                          ? "text-end"
                          : c.align === "center"
                            ? "text-center"
                            : "text-start",
                        priorityClass(c),
                      )}
                    >
                      {c.sort ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(c.key)}
                          className={cn(
                            "inline-flex items-center gap-1 hover:text-ink transition-colors",
                            active && "text-ink",
                            c.align === "end" && "flex-row-reverse",
                          )}
                        >
                          {c.header}
                          {active &&
                            (asc ? <IconArrowUp size={11} /> : <IconArrowDown size={11} />)}
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "hairline-b last:border-b-0 transition-colors",
                      onRowClick && "cursor-pointer hover:bg-sunken",
                    )}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          dense ? "h-10" : "h-11",
                          "px-4 align-middle",
                          // A column with no fixed width is the flexible one —
                          // a name, a customer. `max-width: 0` makes the cell
                          // take what is left instead of what its longest word
                          // wants, so a long name ellipsises rather than
                          // pushing the whole table wider than the phone.
                          !c.width && "max-w-0",
                          c.align === "end"
                            ? "text-end"
                            : c.align === "center"
                              ? "text-center"
                              : "text-start",
                          priorityClass(c),
                        )}
                      >
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
              ))}
            </tbody>
            {footer && <tfoot className="hairline-t bg-sunken/60">{footer}</tfoot>}
          </table>
        </div>

        {visible.length === 0 && (
          <EmptyState
            compact
            title={query ? t("empty.noResults") : (emptyTitle ?? t("empty.none"))}
            hint={query ? t("empty.noResultsHint") : emptyHint}
            action={query ? undefined : emptyAction}
          />
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 mt-3 no-print">
          <span className="text-2xs text-faint num">
            {current * pageSize + 1}–{Math.min((current + 1) * pageSize, sorted.length)}{" "}
            {t("msg.ofTotal", { n: sorted.length })}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={current === 0}
              aria-label={t("action.back")}
            >
              <IconChevronStart className="rtl:rotate-180" />
            </Button>
            <span className="text-2xs text-muted num px-1">
              {current + 1} / {pageCount}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={current >= pageCount - 1}
            >
              <IconChevronEnd className="rtl:rotate-180" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
