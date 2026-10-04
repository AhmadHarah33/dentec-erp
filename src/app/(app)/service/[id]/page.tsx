import { notFound } from "next/navigation";
import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { buildStockIndex, onHand } from "@/lib/stock";
import { jobShortages } from "@/lib/service";
import { JobClient } from "./job-client";
import { requireAccess } from "@/lib/auth/server";
import { withoutCost } from "@/lib/permissions";

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const member = await requireAccess("service", "view");
  const { id } = await params;
  const { locale } = await getI18n();
  const db = await snapshot();

  const job = db.serviceJobs.find((j) => j.id === id);
  if (!job) notFound();

  const index = buildStockIndex(db.stockMoves);

  // Build onHand record for part picker
  const onHandRecord: Record<string, number> = {};
  for (const item of db.items) {
    onHandRecord[item.id] = onHand(index, item.id);
  }

  // Shortages are resolved to names here so the client never re-derives them.
  const shortages = jobShortages(job, index).map((s) => ({
    ...s,
    name: db.items.find((i) => i.id === s.itemId)?.nameAr ?? s.itemId,
  }));

  const invoice = job.invoiceId
    ? db.salesInvoices.find((i) => i.id === job.invoiceId)
    : undefined;

  const unit = job.unitId ? db.units.find((u) => u.id === job.unitId) : undefined;
  const unitInvoice = unit?.invoiceId ? db.salesInvoices.find((i) => i.id === unit.invoiceId) : undefined;

  return (
    <JobClient
      unit={
        unit
          ? {
              soldAt: unit.soldAt,
              warrantyEnd: unit.warrantyEnd,
              invoice: unitInvoice ? { id: unitInvoice.id, number: unitInvoice.number } : null,
            }
          : null
      }
      job={job}
      customer={db.customers.find((c) => c.id === job.customerId)}
      shortages={shortages}
      invoice={invoice ? { id: invoice.id, number: invoice.number } : null}
      items={withoutCost(db.items, member.role)}
      users={db.users}
      warehouses={db.warehouses}
      currency={db.settings.baseCurrency}
      onHand={onHandRecord}
      locale={locale}
    />
  );
}
