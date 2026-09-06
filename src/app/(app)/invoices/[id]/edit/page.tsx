import { notFound, redirect } from "next/navigation";
import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { buildStockIndex, onHand } from "@/lib/stock";
import { DocumentEditor } from "@/components/app/document-editor";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { locale } = await getI18n();
  const db = await snapshot();

  const invoice = db.salesInvoices.find((i) => i.id === id);
  if (!invoice) notFound();
  // Issued invoices have already moved stock; editing them would desynchronise
  // the ledger, so send the user back to the read-only view.
  if (invoice.status !== "draft") redirect(`/invoices/${id}`);

  const index = buildStockIndex(db.stockMoves);
  const stock: Record<string, number> = {};
  for (const item of db.items) {
    stock[item.id] = onHand(index, item.id, invoice.warehouseId);
  }

  return (
    <DocumentEditor
      kind="sales"
      docId={invoice.id}
      initial={{
        partyId: invoice.customerId,
        warehouseId: invoice.warehouseId,
        date: invoice.date,
        secondDate: invoice.dueDate,
        currency: invoice.currency,
        fxRate: invoice.fxRate,
        discountKind: invoice.discountKind,
        discountValue: invoice.discountValue,
        lines: invoice.lines,
        notes: invoice.notes,
      }}
      parties={db.customers.map((c) => ({ id: c.id, name: c.name }))}
      items={db.items.filter((i) => i.active)}
      warehouses={db.warehouses.filter((w) => w.active)}
      settings={db.settings}
      onHand={stock}
      locale={locale}
    />
  );
}
