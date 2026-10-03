/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // A production build can be pointed at its own folder so it never
  // overwrites the .next of a dev server running in the same checkout:
  //   NEXT_DIST_DIR=.next-build npm run build
  distDir: process.env.NEXT_DIST_DIR || ".next",
};
export default nextConfig;
