/**
 * The body of both PDF routes. `/api/invoices/[id]/pdf` and
 * `/api/purchases/[id]/pdf` differ by one word, so they share this.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getLocale } from "@/lib/i18n/server";
import { attachmentHeader, renderPdf } from "./render";
import { loadDocument, pdfFilename, type DocumentKind } from "./document";
import { currentMember } from "@/lib/auth/server";
import { can } from "@/lib/permissions";

export async function handlePdfRequest(
  request: NextRequest,
  kind: DocumentKind,
  id: string,
): Promise<Response> {
  const member = await currentMember();
  if (!member) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!can(member.role, kind === "invoice" ? "invoices" : "purchasing", "view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const locale = await getLocale();

  // Resolve the document first: a missing invoice should 404 immediately
  // rather than after a browser launch, and we need its number for the
  // filename anyway.
  const doc = await loadDocument(kind, id, locale);
  if (!doc) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // The headless browser fetches the print page from this same server over
  // its internal address, not the public one: no round trip out through the
  // tunnel and back. INTERNAL_ORIGIN is set in production (the container's
  // own http://127.0.0.1:3000); in development the request origin is local.
  const origin = (process.env.INTERNAL_ORIGIN ?? request.nextUrl.origin).replace(/\/$/, "");

  try {
    const pdf = await renderPdf({
      url: `${origin}/print/${kind}/${id}`,
      origin,
      // The print route is members-only and reads the locale cookie, and the
      // headless browser has no cookies of its own — so it is handed this
      // request's: the session (so it is signed in as the same person, with
      // the same permissions) and the locale.
      cookies: request.cookies.getAll().map((c) => ({ name: c.name, value: c.value })),
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
