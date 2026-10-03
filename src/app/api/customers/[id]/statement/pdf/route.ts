import type { NextRequest } from "next/server";
import { handleStatementPdf } from "@/lib/pdf/route-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleStatementPdf(request, id);
}
