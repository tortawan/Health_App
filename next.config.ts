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
  // ✅ FIX: Allow development requests from your local network IP
  allowedDevOrigins: ["localhost", "192.168.4.77"],
  
  // Fix: Prevent bundling of transformers.js binaries to avoid cold-start re-downloads and size limits
  serverExternalPackages: ["@xenova/transformers"],
  
  // ✅ FIX: Allow images from your Supabase Project
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'eypxeqldfilsvapibigm.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  experimental: {
    serverActions: {
      // ✅ FIX: Allows Server Actions to work from local network IPs (e.g., 192.168.x.x)
      allowedOrigins: ["*"],
    },
  },

  // ✅ FIX: improved logging for fetch requests to help debug API issues
  logging: {
    fetches: {
      fullUrl: true,
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