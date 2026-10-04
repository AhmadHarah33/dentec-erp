import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie";

/**
 * The front door. Runs before every request except static files and sends
 * anyone without a session cookie to /login.
 *
 * It only knows whether a cookie is present, not whether it is valid: the
 * session lives in Postgres, which the edge runtime cannot reach.
 * `requireMember()` in the (app) layout and the guard in every server action
 * do the real check.
 */

/** Reachable without signing in. Everything else needs a session. */
const PUBLIC = [/^\/login$/, /^\/forgot$/, /^\/auth\//];

/**
 * Server actions accept 8 MB so the import tool can post a few thousand rows.
 * Someone with no session has no business sending more than a form's worth —
 * the sign-in and reset forms are a few hundred bytes.
 */
const ANONYMOUS_BODY_LIMIT = 32 * 1024;

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const signedIn = request.cookies.has(SESSION_COOKIE);
  if (!signedIn && request.method === "POST") {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > ANONYMOUS_BODY_LIMIT) return new NextResponse(null, { status: 413 });
  }
  if (signedIn || PUBLIC.some((re) => re.test(path))) {
    return NextResponse.next();
  }
  // API routes answer 401 instead of a login page a script cannot use.
  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own assets and the public files the login page
  // itself needs (logo, icons, fonts).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|logo.svg|logo.png).*)"],
};
