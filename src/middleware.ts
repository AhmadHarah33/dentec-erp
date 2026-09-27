import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseEnabled, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Keeps the Supabase session fresh and sends anyone signed out to /login.
 *
 * In demo mode (no Supabase env vars) this does nothing at all.
 *
 * This is a gate, not the permission check: role-by-role access is decided in
 * the pages (`requireSection`) and the actions (`deny`), and underneath both
 * by row-level security. A request that slipped past this file would still
 * read nothing.
 */

const PUBLIC_PATHS = ["/login", "/setup", "/auth"];

export async function middleware(request: NextRequest) {
  if (!isSupabaseEnabled()) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl()!, supabaseAnonKey()!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // getUser() validates the token with the auth server — never trust the
  // cookie alone. It also rotates an expiring token into `response`.
  let signedIn = false;
  try {
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  } catch {
    signedIn = false;
  }

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!signedIn && !isPublic) {
    // API routes answer with a status, not an HTML page.
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  if (signedIn && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Node runtime: reads the container's environment at request time, and the
  // Supabase client needs Node APIs. Static assets never reach this file.
  runtime: "nodejs",
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|logo\\.(?:svg|png)|fonts/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)",
  ],
};
