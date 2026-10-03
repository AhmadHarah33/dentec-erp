"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { useLocale } from "@/lib/i18n/context";
import { recordHistory } from "@/app/actions/audit";
import type { AuditRow } from "@/lib/audit";
import { Card, CardHeader } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/page";
import { useCan } from "@/components/app/member-context";
import type { Area } from "@/lib/permissions";
import { AuditEntry } from "./audit-entry";

/**
 * "Who changed this, and when" for one record. Loaded on request rather than
 * with the page: most visits never need it. Shown only to people who may edit
 * the area, which is also what the server enforces.
 */
export function RecordHistory({ collection, id, area }: { collection: string; id: string; area: Area }) {
  const t = useT();
  const { locale } = useLocale();
  const allowed = useCan(area, "edit");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || rows) return;
    let live = true;
    recordHistory(collection, id).then((r) => {
      if (!live) return;
      if (r.ok) setRows(r.data);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [open, rows, collection, id]);

  if (!allowed) return null;

  return (
    <Card className="mb-4 no-print">
      <CardHeader
        title={t("audit.history")}
        action={
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-2xs font-medium text-accent hover:text-accent-strong"
            aria-expanded={open}
          >
            {open ? t("audit.hide") : t("audit.show")}
          </button>
        }
      />
      {open &&
        (failed ? (
          <EmptyState compact title={t("msg.error")} />
        ) : !rows ? (
          <p className="px-4 py-6 text-2xs text-faint">{t("audit.loading")}</p>
        ) : rows.length === 0 ? (
          <EmptyState compact title={t("audit.empty")} />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((r) => (
              <AuditEntry key={r.id} entry={r} locale={locale} />
            ))}
          </div>
        ))}
    </Card>
  );
}
