import { notFound } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { DocumentSheet } from "@/components/print/document-sheet";
import { isDocumentKind, loadDocument } from "@/lib/pdf/document";
import { requireSection } from "@/lib/session";

/**
 * The bare document, on its own route outside `(app)` so it inherits no
 * sidebar, no top bar and no page padding. Chromium loads this to make the
 * PDF, and a person can open it directly to check what the PDF will say.
 */

export const dynamic = "force-dynamic";

export default async function PrintPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!isDocumentKind(kind)) notFound();
  await requireSection(kind === "invoice" ? "invoices" : "purchases");

  const { locale } = await getI18n();
  const doc = await loadDocument(kind, id, locale);
  if (!doc) notFound();

  return (
    <main className="bg-white min-h-screen overflow-x-auto">
      <DocumentSheet {...doc} />
    </main>
  );
}
