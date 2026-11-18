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
  poweredByHeader: false,
  async headers() {
    const dev = process.env.NODE_ENV !== "production";
    // Everything loads from the Hub itself, plus Webflow Cloud's file server, which serves
    // the Hub's own scripts, styles and fonts (…wf-app-prod.cosmic.webflow.services).
    // No other outside scripts, fonts or trackers.
    const assets = "https://*.wf-app-prod.cosmic.webflow.services";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' ${assets}${dev ? " 'unsafe-eval'" : ""}`,
      `style-src 'self' 'unsafe-inline' ${assets}`,
      `img-src 'self' data: blob: ${assets}`,
      `font-src 'self' ${assets}`,
      `connect-src 'self' ${assets}${dev ? " ws:" : ""}`,
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Sign-in links carry a token in the address: never pass it on to other sites.
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;

// Gives `next dev` access to the local D1 database and R2 bucket defined in wrangler.json.
// Only while developing: on Webflow Cloud's build machine it would start a local database and can
// fail with "database is locked" (SQLITE_BUSY).
if (process.env.NODE_ENV === "development") initOpenNextCloudflareForDev();
