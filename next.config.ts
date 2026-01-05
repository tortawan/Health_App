import type { NextConfig } from "next";
import createNextPWA from "next-pwa";

const isProd = process.env.NODE_ENV === "production";

const runtimeCaching = [
  {
    urlPattern: /^https:\/\/fonts\.(gstatic|googleapis)\.com\/.*/i,
    handler: "CacheFirst",
    options: {
      cacheName: "google-fonts",
      expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
    },
  },
  {
    urlPattern: /^https?:\/\/.*/i,
    handler: "NetworkFirst",
    options: {
      cacheName: "offline-cache",
      networkTimeoutSeconds: 10,
      expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 7 },
    },
  },
];

const withPWA = createNextPWA({
  dest: "public",
  disable: !isProd,
  register: true,
  skipWaiting: true,
  runtimeCaching,
  buildExcludes: [/middleware-manifest.json$/],
});

const nextConfig: NextConfig = withPWA({
  reactStrictMode: true,
  // Fix: Prevent bundling of transformers.js binaries to avoid cold-start re-downloads and size limits
  serverExternalPackages: ["@xenova/transformers"],
  experimental: {
    serverActions: {
      allowedOrigins: ["*"],
    },
  },
  async headers() {
    return [
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
});

export default nextConfig;
