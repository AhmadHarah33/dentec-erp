import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { agingByCustomer } from "@/lib/queries";
import { AccountingClient } from "./accounting-client";

export default async function AccountingPage() {
  const { locale } = await getI18n();
  const db = await snapshot();

  // Sort payments and expenses newest first
  const payments = [...db.payments].sort((a, b) =>
    a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1,
  );

  const expenses = [...db.expenses].sort((a, b) =>
    a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1,
  );

  const agingRows = agingByCustomer(db);

  return (
    <AccountingClient
      payments={payments}
      expenses={expenses}
      customers={db.customers}
      suppliers={db.suppliers}
      salesInvoices={db.salesInvoices}
      agingRows={agingRows}
      currency={db.settings.baseCurrency}
      currencies={db.settings.currencies}
      locale={locale}
    />
  );
}
