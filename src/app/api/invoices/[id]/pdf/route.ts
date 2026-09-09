import type { NextRequest } from "next/server";
import { handlePdfRequest } from "@/lib/pdf/route-handler";

/** Playwright needs a real process, so this cannot run on the edge runtime. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handlePdfRequest(request, "invoice", id);
}
