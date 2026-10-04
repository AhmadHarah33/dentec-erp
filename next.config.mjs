/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
