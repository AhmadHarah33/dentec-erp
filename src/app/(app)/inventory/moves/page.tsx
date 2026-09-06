import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { MovesClient } from "./moves-client";

export default async function MovesPage() {
  const { locale } = await getI18n();
  const db = await snapshot();

  // Newest first: the ledger is read to answer "what just happened".
  const moves = [...db.stockMoves].sort((a, b) =>
    a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1,
  );

  return (
    <MovesClient
      moves={moves}
      items={db.items}
      warehouses={db.warehouses}
      currency={db.settings.baseCurrency}
      locale={locale}
    />
  );
}
