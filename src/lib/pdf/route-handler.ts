/**
 * The body of both PDF routes. `/api/invoices/[id]/pdf` and
 * `/api/purchases/[id]/pdf` differ by one word, so they share this.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getLocale } from "@/lib/i18n/server";
import { attachmentHeader, internalOrigin, RenderBusy, renderPdf } from "./render";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { DEMO } from "@/lib/demo";
import { LOCALE_COOKIE } from "@/lib/i18n";
import { loadDocument, pdfFilename, type DocumentKind } from "./document";
import { currentMember } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { loadStatement, readDate, statementFilename } from "./statement-doc";

/** Only the cookies the print page reads. The browser has no business with any others. */
function forwardedCookies(request: NextRequest) {
  return request.cookies
    .getAll()
    .filter((c) => c.name === SESSION_COOKIE || c.name === LOCALE_COOKIE)
    .map((c) => ({ name: c.name, value: c.value }));
}

function busy(): Response {
  return NextResponse.json({ error: "busy" }, { status: 503, headers: { "Retry-After": "5" } });
}

/** The demo host cannot render PDFs; say so plainly instead of failing inside Chromium. */
function disabledInDemo(): Response {
  return NextResponse.json({ error: "disabled_in_demo" }, { status: 503 });
}

export async function handlePdfRequest(
  request: NextRequest,
  kind: DocumentKind,
  id: string,
): Promise<Response> {
  if (DEMO) return disabledInDemo();
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
  // tunnel and back. See internalOrigin for why it is never taken from the
  // request in production.
  const origin = internalOrigin(request.nextUrl.origin);

  try {
    const pdf = await renderPdf({
      url: `${origin}/print/${kind}/${id}`,
      origin,
      // The print route is members-only and reads the locale cookie, and the
      // headless browser has no cookies of its own — so it is handed this
      // request's: the session (so it is signed in as the same person, with
      // the same permissions) and the locale.
      cookies: forwardedCookies(request),
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
    if (error instanceof RenderBusy) return busy();
    // The usual cause is a missing Chromium on a fresh checkout. The cause is
    // logged; the response says only that it failed, because the message can
    // carry file paths and addresses.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[pdf] ${kind} ${id} failed:`, message);
    return NextResponse.json({ error: "render_failed" }, { status: 500 });
  }
}

/** The customer statement as a PDF: same renderer, same forwarded session. */
export async function handleStatementPdf(request: NextRequest, customerId: string): Promise<Response> {
  if (DEMO) return disabledInDemo();
  const member = await currentMember();
  if (!member) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!can(member.role, "finance", "view") || !can(member.role, "customers", "view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const loaded = await loadStatement(customerId, from, to);
  if (!loaded) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const origin = internalOrigin(request.nextUrl.origin);
  const query = new URLSearchParams();
  if (readDate(from)) query.set("from", from!);
  if (readDate(to)) query.set("to", to!);

  try {
    const pdf = await renderPdf({
      url: `${origin}/print/statement/${customerId}${query.size ? `?${query}` : ""}`,
      origin,
      cookies: forwardedCookies(request),
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": attachmentHeader(statementFilename(loaded.customer, loaded.statement)),
        "Content-Length": String(pdf.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof RenderBusy) return busy();
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[pdf] statement ${customerId} failed:`, message);
    return NextResponse.json({ error: "render_failed" }, { status: 500 });
  }
}
