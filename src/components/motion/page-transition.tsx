"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useReducedMotion } from "motion/react";
import { useSectionTransition } from "@/components/motion/section-transition";
import { cn } from "@/lib/cn";

/** Views that build up / tear down card by card on their own (Overview, Preventivi, Nuovo preventivo, Clienti, Catalogo, Workspace, Template, Impostazioni, Abbonamento). */
export function hasOwnTransition(pathname: string): boolean {
  return ["/app/overview", "/app/quotes", "/app/quotes/new", "/app/clients", "/app/catalog", "/app/workspace", "/app/templates"].includes(pathname) || pathname.startsWith("/app/settings");
}

/**
 * Page-level part of the app transition (section-transition.tsx, provider in the app shell). Views without their own
 * card choreography (Preventivi, Clienti, Catalogo, Template, Aiuto, editor) get the same rhythm here: on leaving,
 * their top-level blocks drop out in reverse order (CSS, .pt-leaving); on arriving, the page rises in. No remount:
 * the wrapper is persistent, the entrance is a Web Animation started on every visit.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduced = useReducedMotion() ?? false;
  const { visit, leaving } = useSectionTransition();
  const ref = useRef<HTMLDivElement>(null);
  const own = hasOwnTransition(pathname);

  useEffect(() => {
    const node = ref.current;
    if (!node || reduced || own) return;
    const animation = node.animate(
      [
        { opacity: 0, transform: "translateY(24px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    return () => animation.cancel();
  }, [visit, reduced, own]);

  return (
    <div ref={ref} className={cn("pt", leaving && !own && !reduced && "pt-leaving")}>
      {children}
    </div>
  );
}
