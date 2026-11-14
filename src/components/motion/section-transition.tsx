"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useReducedMotion } from "motion/react";

/**
 * "Build up / tear down" navigation for card sections (Abbonamento, Impostazioni).
 *
 * - Entering: every visit to a view gets a new `visit` number; the view keys its card grid on it, so the cards fly in
 *   again even when Next 16 reveals a route it kept hidden in the DOM (back/forward, or a view seen before).
 * - Leaving: <SectionLink> intercepts plain left clicks on links of the section, flags the current path as
 *   leaving (the grid switches to its "exit" variant) and calls router.push once the cards are out (EXIT_MS).
 *   Modified clicks (cmd/ctrl/shift/alt, middle button, target) keep the browser's default behaviour.
 */

export const SECTION_EXIT_MS = 520;

type Ctx = { visit: number; leaving: boolean; navigate: (href: string) => void };
const SectionTransitionContext = createContext<Ctx>({ visit: 0, leaving: false, navigate: () => {} });

export function SectionTransitionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const reduced = useReducedMotion() ?? false;
  // Derived from the path during render (React's "adjust state on prop change" pattern), not in an effect.
  const [nav, setNav] = useState({ path: pathname, visit: 0 });
  const [leavingFrom, setLeavingFrom] = useState<string | null>(null);
  if (nav.path !== pathname) {
    setNav({ path: pathname, visit: nav.visit + 1 });
    setLeavingFrom(null); // arrived: a view we left earlier (back button, cached route) must build up again
  }
  const leaving = leavingFrom === pathname;
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const navigate = useCallback(
    (href: string) => {
      if (href === pathname) return;
      if (reduced) {
        router.push(href);
        return;
      }
      if (timer.current !== undefined) return; // already leaving
      setLeavingFrom(pathname);
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        router.push(href);
      }, SECTION_EXIT_MS);
    },
    [pathname, reduced, router],
  );

  return <SectionTransitionContext.Provider value={{ visit: nav.visit, leaving, navigate }}>{children}</SectionTransitionContext.Provider>;
}

export function useSectionTransition(): Ctx {
  return useContext(SectionTransitionContext);
}

function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  const target = event.currentTarget.getAttribute("target");
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && (!target || target === "_self");
}

/** next/link (so it still prefetches) that plays the exit of the current view before navigating inside the section. */
export function SectionLink({ href, onClick, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const { navigate } = useSectionTransition();
  return (
    <Link
      href={href}
      prefetch
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || !isPlainClick(event)) return;
        event.preventDefault();
        navigate(href);
      }}
    />
  );
}
