import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { PurchasesClient } from "./purchases-client";
import { requireAccess } from "@/lib/auth/server";

export default async function PurchasesPage() {
  await requireAccess("purchasing", "view");
  const { locale } = await getI18n();
  const db = await snapshot();

  const orders = db.purchaseOrders.sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <PurchasesClient
      orders={orders}
      suppliers={db.suppliers}
      warehouses={db.warehouses}
      currency={db.settings.baseCurrency}
      locale={locale}
    />
  );
}
