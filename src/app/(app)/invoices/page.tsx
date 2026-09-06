import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { invoiceOutstanding, invoiceTotalBase } from "@/lib/queries";
import { InvoicesClient, type InvoiceRow } from "./invoices-client";

export default async function InvoicesPage() {
  const { locale } = await getI18n();
  const db = await snapshot();

  const rows: InvoiceRow[] = db.salesInvoices
    .map((invoice) => ({
      invoice,
      customerName: db.customers.find((c) => c.id === invoice.customerId)?.name ?? "—",
      total: invoiceTotalBase(invoice),
      outstanding: invoiceOutstanding(invoice, db.payments),
    }))
    .sort((a, b) =>
      a.invoice.date === b.invoice.date
        ? b.invoice.number.localeCompare(a.invoice.number)
        : a.invoice.date < b.invoice.date
          ? 1
          : -1,
    );

  return (
    <InvoicesClient
      rows={rows}
      currency={db.settings.baseCurrency}
      locale={locale}
    />
  );
}
