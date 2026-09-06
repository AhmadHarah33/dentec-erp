import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { supplierBalance } from "@/lib/queries";
import { PartiesClient, type PartyRow } from "@/components/app/parties-client";

export default async function SuppliersPage() {
  const { locale, t } = await getI18n();
  const db = await snapshot();

  const rows: PartyRow[] = db.suppliers.map((party) => ({
    party,
    balance: supplierBalance(party.id, db.purchaseOrders, db.payments),
    documents: db.purchaseOrders.filter((o) => o.supplierId === party.id).length,
  }));

  return (
    <PartiesClient
      which="suppliers"
      title={t("page.suppliers.title")}
      subtitle={t("page.suppliers.subtitle")}
      newLabel={t("page.suppliers.new")}
      rows={rows}
      currency={db.settings.baseCurrency}
      locale={locale}
    />
  );
}
