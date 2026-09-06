import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { buildStockIndex, onHand } from "@/lib/stock";
import { WarehousesClient, type WarehouseRow } from "./warehouses-client";

export default async function WarehousesPage() {
  const { locale } = await getI18n();
  const db = await snapshot();
  const index = buildStockIndex(db.stockMoves);

  const rows: WarehouseRow[] = db.warehouses.map((warehouse) => {
    let units = 0;
    let value = 0;
    let lines = 0;
    for (const item of db.items) {
      const qty = onHand(index, item.id, warehouse.id);
      if (qty === 0) continue;
      lines += 1;
      units += qty;
      value += qty * item.cost;
    }
    return { warehouse, lines, units, value };
  });

  return (
    <WarehousesClient
      rows={rows}
      currency={db.settings.baseCurrency}
      locale={locale}
    />
  );
}
