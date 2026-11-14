import type { MetadataRoute } from "next";

/** The app is private and client quote links must never be crawled. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app/", "/api/", "/q/", "/onboarding"] }],
  };
}
