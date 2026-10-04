/** @type {import('next').NextConfig} */
/**
 * Response headers for every page.
 *
 * No script-src / style-src on purpose: Next's inline bootstrap scripts need
 * a per-request nonce to coexist with one, and a half-working policy that
 * breaks pages is worse than none. These directives need no nonce and close
 * the real holes: framing (clickjacking on a screen with delete and void
 * buttons), form posts to other sites, <base> hijacking and plugins.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The import tool posts a file's rows (up to a few thousand) in one server action.
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  // A production build can be pointed at its own folder so it never
  // overwrites the .next of a dev server running in the same checkout:
  //   NEXT_DIST_DIR=.next-build npm run build
  // The Docker image runs the self-contained server in .next/standalone.
  output: process.env.NEXT_STANDALONE ? "standalone" : undefined,
  distDir: process.env.NEXT_DIST_DIR || ".next",
};
export default nextConfig;
