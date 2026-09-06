import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { buildStockIndex, onHand } from "@/lib/stock";
import { DocumentEditor } from "@/components/app/document-editor";
import { blankDoc } from "@/lib/doc-defaults";

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string }>;
}) {
  const { supplier } = await searchParams;
  const { locale } = await getI18n();
  const db = await snapshot();

  const defaultWarehouse = db.warehouses.find((w) => w.isDefault) ?? db.warehouses[0];
  const index = buildStockIndex(db.stockMoves);

  const stock: Record<string, number> = {};
  for (const item of db.items) {
    stock[item.id] = onHand(index, item.id, defaultWarehouse?.id);
  }

  return (
    <DocumentEditor
      kind="purchase"
      docId={null}
      initial={blankDoc("purchase", db.settings, defaultWarehouse?.id ?? "", supplier ?? "")}
      parties={db.suppliers
        .filter((s) => s.active)
        .map((s) => ({ id: s.id, name: s.name }))}
      items={db.items.filter((i) => i.active)}
      warehouses={db.warehouses.filter((w) => w.active)}
      settings={db.settings}
      onHand={stock}
      locale={locale}
    />
  );
}
