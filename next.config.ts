import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright, ws and the lambda Chromium build use dynamic requires and
  // bundled binaries — keep them out of the JS bundler.
  serverExternalPackages: ["playwright", "playwright-core", "ws", "@sparticuz/chromium"],

  // Vercel: make sure the compressed lambda-Chromium binaries are traced
  // into the serverless function bundle.
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/@sparticuz/chromium/bin/**",
      // Vercel's tracer misses playwright-core's runtime JSON assets
      // (browsers.json is required dynamically by coreBundle.js).
      "./node_modules/playwright-core/browsers.json",
      "./node_modules/playwright-core/package.json",
    ],
  },
};

export default nextConfig;
