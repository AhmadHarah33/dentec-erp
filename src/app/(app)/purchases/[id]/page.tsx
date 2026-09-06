import { notFound } from "next/navigation";
import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { PurchaseDetailClient } from "./purchase-detail-client";

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  return (
    <PurchaseDetailClient
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
