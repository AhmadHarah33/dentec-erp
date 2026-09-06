import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { buildStockIndex } from "@/lib/stock";
import { shortagesByJob } from "@/lib/service";
import { ServiceClient } from "./service-client";

export default async function ServicePage() {
  const { locale } = await getI18n();
  const db = await snapshot();
  const index = buildStockIndex(db.stockMoves);

  // Oldest first inside a column: the job that has waited longest sits on top,
  // which is the order the workshop should clear them in.
  const jobs = [...db.serviceJobs].sort((a, b) => (a.date > b.date ? 1 : -1));

  return (
    <ServiceClient
      jobs={jobs}
      customers={db.customers}
      items={db.items}
      users={db.users}
      shortages={shortagesByJob(db.serviceJobs, index)}
      locale={locale}
    />
  );
}
