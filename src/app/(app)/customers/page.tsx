import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { customerBalance } from "@/lib/queries";
import { PartiesClient, type PartyRow } from "@/components/app/parties-client";

export default async function CustomersPage() {
  const { locale, t } = await getI18n();
  const db = await snapshot();

  const rows: PartyRow[] = db.customers.map((party) => ({
    party,
    balance: customerBalance(party.id, db.salesInvoices, db.payments),
    documents: db.salesInvoices.filter((i) => i.customerId === party.id).length,
  }));

  return (
    <PartiesClient
      which="customers"
      title={t("page.customers.title")}
      subtitle={t("page.customers.subtitle")}
      newLabel={t("page.customers.new")}
      rows={rows}
      currency={db.settings.baseCurrency}
      locale={locale}
    />
  );
}
