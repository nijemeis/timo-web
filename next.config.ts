import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client"],
  // Lets a second dev server run side by side (NEXT_DIST_DIR=.next-alt next dev -p 3210).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
