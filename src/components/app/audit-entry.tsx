"use client";

import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { formatDateTime } from "@/lib/dates";
import { Badge, Num } from "@/components/ui/primitives";
import type { AuditRow } from "@/lib/audit";

/** Fields that exist only to link records or carry bookkeeping; not worth a line. */
const HIDDEN = new Set(["id", "lines", "parts"]);

function useFieldLabel() {
  const t = useT();
  return (field: string) => {
    for (const key of [`label.${field}`, `audit.field.${field}`]) {
      const text = t(key as MessageKey);
      if (text !== key) return text;
    }
    return field;
  };
}

function useValue() {
  const t = useT();
  return (v: unknown): string => {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return t(v ? "audit.yes" : "audit.no");
    if (typeof v === "number" || typeof v === "string") return String(v);
    const json = JSON.stringify(v);
    return json.length > 60 ? json.slice(0, 57) + "…" : json;
  };
}

const ACTION_TONE = { insert: "success", update: "accent", delete: "danger" } as const;

/** One audit-log row: when, who, what happened, and for updates the old → new values. */
export function AuditEntry({
  entry,
  locale,
  showRecord,
}: {
  entry: AuditRow;
  locale: string;
  /** Show which record changed (the Activity page); a record's own history omits it. */
  showRecord?: boolean;
}) {
  const t = useT();
  const fieldLabel = useFieldLabel();
  const show = useValue();

  const changed = Object.keys(entry.after ?? entry.before ?? {}).filter((k) => !HIDDEN.has(k));
  const linesChanged = !!entry.after && "lines" in entry.after;

  return (
    <div className="px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge tone={ACTION_TONE[entry.action]}>{t(`audit.${entry.action}` as MessageKey)}</Badge>
        {showRecord && (
          <span className="font-medium">
            {t(`audit.c.${entry.collection}` as MessageKey)}
            {entry.label && <span className="text-muted"> · <Num>{entry.label}</Num></span>}
          </span>
        )}
        <span className="text-muted">{entry.actorName || t("audit.system")}</span>
        <Num className="text-2xs text-faint ms-auto">{formatDateTime(entry.at, locale)}</Num>
      </div>

      {entry.action === "update" && (changed.length > 0 || linesChanged) && (
        <ul className="mt-2 space-y-1 text-2xs text-muted">
          {changed.map((k) => (
            <li key={k} className="flex flex-wrap gap-x-2">
              <span className="text-ink">{fieldLabel(k)}</span>
              <span>
                <Num>{show(entry.before?.[k])}</Num> → <Num className="text-ink">{show(entry.after?.[k])}</Num>
              </span>
            </li>
          ))}
          {linesChanged && <li className="text-ink">{t("audit.linesChanged")}</li>}
        </ul>
      )}
    </div>
  );
}
