import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseEnabled } from "@/lib/supabase/config";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Ends the session and lands on /login. Reached when a signed-in account has
 * no active profile — deactivated by the owner mid-session — so the person
 * sees the sign-in page with an explanation instead of a redirect loop.
 */
export async function GET(request: NextRequest) {
  if (isSupabaseEnabled()) {
    const supabase = await createUserClient();
    await supabase.auth.signOut();
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = request.nextUrl.searchParams.get("reason") === "inactive" ? "?inactive=1" : "";
  return NextResponse.redirect(url);
}
