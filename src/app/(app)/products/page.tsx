import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { buildStockIndex, onHand } from "@/lib/stock";
import { ItemsClient } from "@/components/app/items-client";

export default async function ProductsPage() {
  const { locale, t } = await getI18n();
  const db = await snapshot();
  const index = buildStockIndex(db.stockMoves);

  const items = db.items.filter((i) => i.itemType === "product");
  const stock: Record<string, number> = {};
  for (const item of db.items) stock[item.id] = onHand(index, item.id);

  return (
    <ItemsClient
      itemType="product"
      title={t("page.products.title")}
      subtitle={t("page.products.subtitle")}
      newLabel={t("page.products.new")}
      items={items}
      categories={db.categories}
      machines={[]}
      onHand={stock}
      currency={db.settings.baseCurrency}
      defaultTaxRate={db.settings.defaultTaxRate}
      locale={locale}
    />
  );
}
