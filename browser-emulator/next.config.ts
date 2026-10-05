import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright, ws and the lambda Chromium build use dynamic requires and
  // bundled binaries — keep them out of the JS bundler.
  serverExternalPackages: ["playwright", "playwright-core", "ws", "@sparticuz/chromium"],

  // Include the compressed Chromium assets in serverless API bundles. This
  // is needed by both Netlify's Next.js adapter and Vercel at runtime.
  outputFileTracingIncludes: {
    "/api/session": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/session/**/*": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
