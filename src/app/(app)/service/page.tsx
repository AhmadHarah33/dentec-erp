import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { buildStockIndex } from "@/lib/stock";
import { shortagesByJob } from "@/lib/service";
import { ServiceClient } from "./service-client";
import { requireAccess } from "@/lib/auth/server";
import { withoutCost } from "@/lib/permissions";

export default async function ServicePage() {
  const member = await requireAccess("service", "view");
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
      items={withoutCost(db.items, member.role)}
      users={db.users}
      units={db.units}
      shortages={shortagesByJob(db.serviceJobs, index)}
      locale={locale}
    />
  );
}
