/**
 * The body of both PDF routes. `/api/invoices/[id]/pdf` and
 * `/api/purchases/[id]/pdf` differ by one word, so they share this.
 */

import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { attachmentHeader, renderPdf } from "./render";
import { loadDocument, pdfFilename, type DocumentKind } from "./document";

export async function handlePdfRequest(
  request: NextRequest,
  kind: DocumentKind,
  id: string,
): Promise<Response> {
  const locale = await getLocale();

  // Resolve the document first: a missing invoice should 404 immediately
  // rather than after a browser launch, and we need its number for the
  // filename anyway.
  const doc = await loadDocument(kind, id, locale);
  if (!doc) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Behind a tunnel or a proxy the request URL is the internal one, so the
  // forwarded headers are what say where this app actually answers.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const origin =
    forwardedHost && forwardedProto
      ? `${forwardedProto}://${forwardedHost}`
      : request.nextUrl.origin;

  try {
    const pdf = await renderPdf({
      url: `${origin}/print/${kind}/${id}`,
      origin,
      // The print route reads the locale cookie like every other route; the
      // headless browser has no cookies of its own, so it is handed ours.
      cookies: [{ name: LOCALE_COOKIE, value: locale }],
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": attachmentHeader(pdfFilename(doc.number)),
        "Content-Length": String(pdf.length),
        // A document can be edited; a stale PDF is worse than a slow one.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // The usual cause is a missing Chromium on a fresh checkout, and a JSON
    // error saying so is far more useful than a broken download.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[pdf] ${kind} ${id} failed:`, message);
    return NextResponse.json(
      { error: "render_failed", detail: message },
      { status: 500 },
    );
  }
}
