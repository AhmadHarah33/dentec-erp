import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { buildStockIndex, onHand } from "@/lib/stock";
import { InventoryClient, type InventoryRow } from "./inventory-client";
import { requireAccess } from "@/lib/auth/server";
import { seesCost } from "@/lib/permissions";

export default async function InventoryPage() {
  const member = await requireAccess("inventory", "view");
  const { locale } = await getI18n();
  const db = await snapshot();
  const index = buildStockIndex(db.stockMoves);
  const showCost = seesCost(member.role);

  const rows: InventoryRow[] = db.items
    .filter((i) => i.active)
    .map((item) => {
      const perWarehouse: Record<string, number> = {};
      for (const w of db.warehouses) perWarehouse[w.id] = onHand(index, item.id, w.id);
      return {
        item: showCost ? item : { ...item, cost: 0 },
        total: onHand(index, item.id),
        perWarehouse,
        value: showCost ? onHand(index, item.id) * item.cost : 0,
      };
    });

  return (
    <InventoryClient
      rows={rows}
      warehouses={db.warehouses}
      categories={db.categories}
      showCost={showCost}
      currency={db.settings.baseCurrency}
      locale={locale}
    />
  );
}
