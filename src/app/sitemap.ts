import type { MetadataRoute } from "next";
import { SITE_URL } from "@/domain/site";

/** Only public marketing and legal pages. App routes and client quote links stay out. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/register`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/termini`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
