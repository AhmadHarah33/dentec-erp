import { getI18n } from "@/lib/i18n/server";
import { requireAccess } from "@/lib/auth/server";
import { AUDIT_PAGE, COLLECTION_AREA, listAudit } from "@/lib/audit";
import { ActivityClient } from "./activity-client";

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ collection?: string; before?: string }>;
}) {
  await requireAccess("settings", "edit");
  const { locale } = await getI18n();
  const { collection, before } = await searchParams;

  const known = collection && collection in COLLECTION_AREA ? collection : undefined;
  const beforeId = before && /^\d+$/.test(before) ? Number(before) : undefined;
  // One extra row tells us whether there is an older page without a count query.
  const fetched = await listAudit({ collection: known, beforeId, limit: AUDIT_PAGE + 1 });
  const rows = fetched.slice(0, AUDIT_PAGE);
  const olderCursor = fetched.length > AUDIT_PAGE ? rows[rows.length - 1].id : null;

  return (
    <ActivityClient
      rows={rows}
      collections={Object.keys(COLLECTION_AREA)}
      collection={known ?? ""}
      olderCursor={olderCursor}
      firstPage={beforeId === undefined}
      locale={locale}
    />
  );
}
