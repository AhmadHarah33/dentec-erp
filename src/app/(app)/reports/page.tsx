import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { buildStockIndex, onHand } from "@/lib/stock";
import { ReportsClient } from "./reports-client";

export default async function ReportsPage() {
  const { locale } = await getI18n();
  const db = await snapshot();

  const index = buildStockIndex(db.stockMoves);

  // Convert lastMove Map to plain object for serialization
  const lastMoveDate: Record<string, string> = {};
  for (const [itemId, date] of index.lastMove.entries()) {
    lastMoveDate[itemId] = date;
  }

  // Build stock record with on-hand quantities per item
  const stock: Record<string, number> = {};
  for (const item of db.items) {
    stock[item.id] = onHand(index, item.id);
  }

  return (
    <ReportsClient
      invoices={db.salesInvoices}
      items={db.items}
      customers={db.customers}
      stock={stock}
      lastMoveDate={lastMoveDate}
      currency={db.settings.baseCurrency}
      locale={locale}
    />
  );
}
