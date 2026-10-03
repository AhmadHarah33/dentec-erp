"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import type { AuditRow } from "@/lib/audit";
import { PageHeader, EmptyState, Toolbar } from "@/components/ui/page";
import { Button, Card, Select } from "@/components/ui/primitives";
import { PageTabs } from "@/components/ui/tabs";
import { SETTINGS_TABS } from "@/lib/tabs";
import { AuditEntry } from "@/components/app/audit-entry";

export function ActivityClient({
  rows,
  collections,
  collection,
  olderCursor,
  firstPage,
  locale,
}: {
  rows: AuditRow[];
  collections: string[];
  collection: string;
  olderCursor: number | null;
  firstPage: boolean;
  locale: string;
}) {
  const t = useT();
  const router = useRouter();

  const href = (params: { collection?: string; before?: number | null }) => {
    const q = new URLSearchParams();
    if (params.collection) q.set("collection", params.collection);
    if (params.before) q.set("before", String(params.before));
    const s = q.toString();
    return "/settings/activity" + (s ? `?${s}` : "");
  };

  return (
    <>
      <PageHeader title={t("nav.settings")} subtitle={t("audit.subtitle")} />
      <PageTabs tabs={SETTINGS_TABS.map((x) => ({ href: x.href, label: t(x.labelKey) }))} />

      <Toolbar>
        <Select
          className="w-auto min-w-44"
          aria-label={t("audit.filter")}
          value={collection}
          onChange={(e) => router.push(href({ collection: e.target.value }))}
        >
          <option value="">{t("audit.allRecords")}</option>
          {collections.map((c) => (
            <option key={c} value={c}>
              {t(`audit.c.${c}` as MessageKey)}
            </option>
          ))}
        </Select>
      </Toolbar>

      <Card>
        {rows.length === 0 ? (
          <EmptyState title={t("audit.empty")} hint={t("audit.emptyHint")} />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((r) => (
              <AuditEntry key={r.id} entry={r} locale={locale} showRecord />
            ))}
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between gap-2 mt-4">
        {!firstPage ? (
          <Button onClick={() => router.push(href({ collection }))}>{t("audit.newest")}</Button>
        ) : (
          <span />
        )}
        {olderCursor !== null && (
          <Button onClick={() => router.push(href({ collection, before: olderCursor }))}>{t("audit.older")}</Button>
        )}
      </div>
    </>
  );
}
