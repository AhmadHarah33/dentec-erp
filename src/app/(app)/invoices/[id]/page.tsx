import { notFound } from "next/navigation";
import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { paidForInvoice } from "@/lib/queries";
import { localName } from "@/lib/labels";
import { InvoiceDetailClient } from "./invoice-detail-client";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { locale } = await getI18n();
  const db = await snapshot();

  const invoice = db.salesInvoices.find((i) => i.id === id);
  if (!invoice) notFound();

  const customer = db.customers.find((c) => c.id === invoice.customerId);
  const warehouse = db.warehouses.find((w) => w.id === invoice.warehouseId);

  // Resolve line item names on the server so the client holds no lookup table.
  const lineItems = invoice.lines.map((line) => {
    const item = line.itemId ? db.items.find((i) => i.id === line.itemId) : undefined;
    return {
      id: line.id,
      name: item ? localName(item, locale) : line.description,
      sku: item?.sku ?? "",
      unit: item?.unit ?? "piece",
    };
  });

  return (
    <InvoiceDetailClient
      invoice={invoice}
      customer={customer ?? null}
      warehouseName={warehouse ? localName(warehouse, locale) : "—"}
      lineItems={lineItems}
      payments={db.payments
        .filter((p) => p.invoiceId === invoice.id)
        .sort((a, b) => (a.date < b.date ? 1 : -1))}
      paid={paidForInvoice(db.payments, invoice.id)}
      settings={db.settings}
      locale={locale}
    />
  );
}
