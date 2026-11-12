import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  experimental: {
    // Logo (1 MB) and client CSV (1 MB) travel through Server Actions.
    serverActions: { bodySizeLimit: "2mb" },
  },
  serverExternalPackages: ["@libsql/client", "libsql", "@react-pdf/renderer", "sharp"],
  // PDF fonts and template photos are read from disk at runtime: ship them with the function.
  outputFileTracingIncludes: {
    "/api/quotes/[quoteId]/pdf": ["./src/server/pdf/fonts/**", "./src/server/pdf/photos/**"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // App pages. Uploaded logos get their own stricter policy below.
        source: "/((?!api/assets/).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "img-src 'self' data: blob:",
              "style-src 'self' 'unsafe-inline'",
              "script-src 'self' 'unsafe-inline'",
              "connect-src 'self'",
              "font-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
      {
        source: "/api/assets/:path*",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'; sandbox" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
