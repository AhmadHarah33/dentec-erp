import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { buildStockIndex, onHand } from "@/lib/stock";
import { ItemsClient } from "@/components/app/items-client";

export default async function SparePartsPage() {
  const { locale, t } = await getI18n();
  const db = await snapshot();
  const index = buildStockIndex(db.stockMoves);

  const items = db.items.filter((i) => i.itemType === "spare_part");
  const stock: Record<string, number> = {};
  for (const item of db.items) stock[item.id] = onHand(index, item.id);

  return (
    <ItemsClient
      itemType="spare_part"
      title={t("page.spareParts.title")}
      subtitle={t("page.spareParts.subtitle")}
      newLabel={t("page.spareParts.new")}
      items={items}
      categories={db.categories}
      machines={db.items.filter((i) => i.itemType === "product" && i.active)}
      onHand={stock}
      currency={db.settings.baseCurrency}
      defaultTaxRate={db.settings.defaultTaxRate}
      locale={locale}
    />
  );
}
