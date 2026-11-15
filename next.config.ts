import type { NextConfig } from "next";

const publicQuoteHeaders = ["/q/:path*", "/api/q/:path*"];
const dev = process.env.NODE_ENV === "development";

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
    // Phase 4: the send email can carry the PDF, rendered by the queue (cron) or right after the send action.
    "/api/cron/outbox": ["./src/server/pdf/fonts/**", "./src/server/pdf/photos/**"],
    "/q/[token]/pdf": ["./src/server/pdf/fonts/**", "./src/server/pdf/photos/**"],
    "/app/quotes/[quoteId]": ["./src/server/pdf/fonts/**", "./src/server/pdf/photos/**"],
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
              // Cloudflare Turnstile: script and challenge iframe (auth pages; harmless elsewhere).
              // React dev needs eval(); production React never does.
              `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
              "frame-src https://challenges.cloudflare.com",
              `connect-src 'self' https://challenges.cloudflare.com${dev ? " ws: wss:" : ""}`,
              "font-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
      ...publicQuoteHeaders.map((source) => ({
        // Client quote links (phase 4): never indexed, never cached, never leaked through Referer.
        // Listed after the global rules: for the same key the last match wins.
        source,
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      })),
      {
        source: "/api/assets/:path*",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'; sandbox" }],
      },
    ];
  },
  async redirects() {
    // Solo l'alias di produzione: le Preview restano sui propri host *.vercel.app.
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "ctrl-quotes.vercel.app" }],
        destination: "https://quotes.ctrlagency.dev/:path*",
        permanent: true,
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
