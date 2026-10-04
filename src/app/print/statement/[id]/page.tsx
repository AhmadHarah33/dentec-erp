import { notFound } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { StatementSheet } from "@/components/print/statement-sheet";
import { loadStatement } from "@/lib/pdf/statement-doc";
import { requireAccess } from "@/lib/auth/server";

/** A customer's statement on its own route, like the invoice print page. */
export const dynamic = "force-dynamic";

export default async function StatementPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const { from, to } = await searchParams;
  // Outside (app), so it gets no layout guard. A statement lists payments, so
  // it needs the finance area as well as the customer.
  await requireAccess("finance", "view");
  await requireAccess("customers", "view");

  const { locale } = await getI18n();
  const loaded = await loadStatement(id, from, to);
  if (!loaded) notFound();

  return (
    <main className="bg-white min-h-screen">
      <StatementSheet {...loaded} locale={locale} />
    </main>
  );
}
