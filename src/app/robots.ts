import type { MetadataRoute } from "next";
import { SITE_URL } from "@/domain/site";

/** The app is private and client quote links must never be crawled. The landing and legal pages are public. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app/", "/api/", "/q/", "/onboarding", "/invite/", "/dev/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
