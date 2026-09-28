/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Docker image builds a self-contained server (see Dockerfile). Left
  // off otherwise, because `next start` and Vercel do not want it.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};
export default nextConfig;
