"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/context";
import { searchIndex, type SearchEntry, type SearchKind } from "@/lib/search";
import { Input } from "@/components/ui/primitives";
import {
  IconDocument,
  IconSearch,
  IconTooth,
  IconTruck,
  IconUsers,
  IconWrench,
} from "@/components/ui/icons";
import type { MessageKey } from "@/lib/i18n";

const KIND_ICON = {
  invoice: IconDocument,
  customer: IconUsers,
  supplier: IconTruck,
  item: IconTooth,
  job: IconWrench,
} as const;

const KIND_LABEL: Record<SearchKind, MessageKey> = {
  invoice: "shell.group.invoices",
  customer: "shell.group.customers",
  supplier: "shell.group.suppliers",
  item: "shell.group.items",
  job: "shell.group.jobs",
};

/**
 * One box that finds an invoice number, a customer, a part or a job from any
 * page. Keyboard-first: arrows move, Enter opens, Escape closes — the trip to
 * the sidebar and down a list is the thing this is meant to replace.
 */
export function GlobalSearch({ entries }: { entries: SearchEntry[] }) {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchIndex(entries, query), [entries, query]);

  useEffect(() => setCursor(0), [query]);

  // Clicking elsewhere closes the panel but keeps the text, so a mis-click
  // does not throw away what was typed.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function go(entry: SearchEntry) {
    setOpen(false);
    setQuery("");
    router.push(entry.href);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[cursor]);
    }
  }

  const showPanel = open && query.trim().length > 0;

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <IconSearch className="absolute start-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={t("shell.searchPlaceholder")}
        aria-label={t("action.search")}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        className="ps-9 rounded-full bg-sunken border-transparent hover:bg-surface focus:bg-surface"
      />

      {showPanel && (
        <div
          id="global-search-results"
          role="listbox"
          className="anim-pop absolute top-full inset-x-0 mt-2 bg-surface border border-line rounded-lg shadow-pop overflow-hidden z-40"
        >
          {results.length === 0 ? (
            <p className="px-4 py-3 text-2xs text-faint">
              {query.trim().length < 2 ? t("shell.searchHint") : t("shell.noResults")}
            </p>
          ) : (
            <ul>
              {results.map((r, i) => {
                const Glyph = KIND_ICON[r.kind];
                return (
                  <li key={r.kind + r.href + r.label}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === cursor}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => go(r)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 h-12 text-start transition-colors",
                        i === cursor ? "bg-accent-soft" : "hover:bg-sunken",
                      )}
                    >
                      <span className="grid place-items-center size-7 rounded-xs bg-sunken text-muted shrink-0">
                        <Glyph size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium truncate">{r.label}</span>
                        {r.sub && (
                          <span className="block text-2xs text-faint truncate">{r.sub}</span>
                        )}
                      </span>
                      <span className="text-2xs text-faint shrink-0">
                        {t(KIND_LABEL[r.kind])}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
