import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { buildStockIndex, onHand } from "@/lib/stock";
import { InventoryClient, type InventoryRow } from "./inventory-client";

export default async function InventoryPage() {
  const { locale } = await getI18n();
  const db = await snapshot();
  const index = buildStockIndex(db.stockMoves);

  const rows: InventoryRow[] = db.items
    .filter((i) => i.active)
    .map((item) => {
      const perWarehouse: Record<string, number> = {};
      for (const w of db.warehouses) perWarehouse[w.id] = onHand(index, item.id, w.id);
      return {
        item,
        total: onHand(index, item.id),
        perWarehouse,
        value: onHand(index, item.id) * item.cost,
      };
    });

  return (
    <InventoryClient
      rows={rows}
      warehouses={db.warehouses}
      categories={db.categories}
      currency={db.settings.baseCurrency}
      locale={locale}
    />
  );
}
