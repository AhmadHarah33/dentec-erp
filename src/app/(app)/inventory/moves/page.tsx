import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { MovesClient } from "./moves-client";
import { requireAccess } from "@/lib/auth/server";
import { seesCost, withoutCost } from "@/lib/permissions";

export default async function MovesPage() {
  const member = await requireAccess("inventory", "view");
  const { locale } = await getI18n();
  const db = await snapshot();

  // Newest first: the ledger is read to answer "what just happened".
  const showCost = seesCost(member.role);
  const moves = [...db.stockMoves]
    .map((m) => (showCost ? m : { ...m, unitCost: 0 }))
    .sort((a, b) =>
    a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1,
  );

  return (
    <MovesClient
      moves={moves}
      items={withoutCost(db.items, member.role)}
      showCost={showCost}
      warehouses={db.warehouses}
      currency={db.settings.baseCurrency}
      locale={locale}
    />
  );
}
