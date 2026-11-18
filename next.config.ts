import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// The Hub runs at the root of its own domain (hub.theideafarm.com), so no basePath.
const nextConfig: NextConfig = {
  // This app lives inside ~/Documents/Site, which has its own lockfile; pin the root here.
  outputFileTracingRoot: __dirname,
  experimental: {
    // Clients attach photos and PDFs to requests; the default 1 MB is too small.
    serverActions: { bodySizeLimit: "60mb" },
  },
};

export default nextConfig;

// Gives `next dev` access to the local D1 database and R2 bucket defined in wrangler.jsonc.
initOpenNextCloudflareForDev();
