import { notFound } from "next/navigation";
import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { PurchaseDetailClient } from "./purchase-detail-client";
import { requireAccess } from "@/lib/auth/server";

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAccess("purchasing", "view");
  const { id } = await params;
  const { locale } = await getI18n();
  const db = await snapshot();

  const order = db.purchaseOrders.find((o) => o.id === id);
  if (!order) notFound();

  const supplier = db.suppliers.find((s) => s.id === order.supplierId);
  if (!supplier) notFound();

  const warehouse = db.warehouses.find((w) => w.id === order.warehouseId);
  if (!warehouse) notFound();

  const items = db.items;
  const settings = db.settings;

  // Orders drafted to un-block a service job carry the link back to it.
  const job = order.serviceJobId
    ? db.serviceJobs.find((j) => j.id === order.serviceJobId)
    : undefined;

  // Each delivery wrote its own stock moves; group them by day for the receipts list.
  const receipts = new Map<string, number>();
  for (const m of db.stockMoves) {
    if (m.refType === "purchase_order" && m.refId === order.id && m.type === "purchase") {
      receipts.set(m.date, (receipts.get(m.date) ?? 0) + m.qtyDelta);
    }
  }

  return (
    <PurchaseDetailClient
      receipts={[...receipts].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, qty]) => ({ date, qty }))}
      order={order}
      job={job ? { id: job.id, number: job.number } : null}
      supplier={supplier}
      warehouse={warehouse}
      items={items}
      settings={settings}
      locale={locale}
    />
  );
}
