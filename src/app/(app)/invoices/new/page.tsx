import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { buildStockIndex, onHand } from "@/lib/stock";
import { DocumentEditor } from "@/components/app/document-editor";
import { blankDoc } from "@/lib/doc-defaults";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { customer } = await searchParams;
  const { locale } = await getI18n();
  const db = await snapshot();

  const defaultWarehouse = db.warehouses.find((w) => w.isDefault) ?? db.warehouses[0];
  const index = buildStockIndex(db.stockMoves);

  // On-hand in the default warehouse, so the editor can warn before a line is
  // saved that cannot actually be shipped.
  const stock: Record<string, number> = {};
  for (const item of db.items) {
    stock[item.id] = onHand(index, item.id, defaultWarehouse?.id);
  }

  return (
    <DocumentEditor
      kind="sales"
      docId={null}
      initial={blankDoc("sales", db.settings, defaultWarehouse?.id ?? "", customer ?? "")}
      parties={db.customers
        .filter((c) => c.active)
        .map((c) => ({ id: c.id, name: c.name }))}
      items={db.items.filter((i) => i.active)}
      warehouses={db.warehouses.filter((w) => w.active)}
      settings={db.settings}
      onHand={stock}
      locale={locale}
    />
  );
}
