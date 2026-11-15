import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";
import { SITE_URL } from "@/domain/site";

const title = "CTRL® Quotes · Preventivi che chiudono";
const description =
  "Crea preventivi con il tuo brand, mandali con un link e lascia che il cliente li legga, li accetti e li paghi online. 7 giorni gratis, senza carta.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "it_IT",
    url: "/",
    siteName: "CTRL® Quotes",
    title,
    description,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "CTRL® Quotes, preventivi che chiudono" }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  robots: { index: true, follow: true },
};

/** Public landing at the site root. The app lives under /app. */
export default function HomePage() {
  return <Landing />;
}
