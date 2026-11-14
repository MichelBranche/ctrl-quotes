"use client";

import { usePathname } from "next/navigation";
import { SectionTransitionProvider } from "@/components/motion/section-transition";

/**
 * Impostazioni: card home plus full-width sub-pages that build up and tear down (section-transition.tsx).
 * No side menu any more: every page links back to the home. Abbonamento has its own layout and transitions.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/app/settings/billing")) return <>{children}</>;
  return <SectionTransitionProvider>{children}</SectionTransitionProvider>;
}
