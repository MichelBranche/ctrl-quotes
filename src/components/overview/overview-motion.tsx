"use client";

import type { ComponentProps, ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { SectionTransitionProvider, useSectionTransition } from "@/components/motion/section-transition";
import { cn } from "@/lib/cn";

/*
 * Overview "build up / tear down" (same system as Impostazioni and Abbonamento, see section-transition.tsx).
 * The page stays a server component: these wrappers only add motion around its server-rendered sections.
 * Entering: on first load and on every return (also back/forward), keyed on the visit. Leaving: any in-app link.
 */

type Dir = { x: number; y: number };
export const ovDirs = {
  hero: { x: -160, y: 0 },
  setup: { x: 160, y: 0 },
  kpi1: { x: 0, y: 150 },
  kpi2: { x: 0, y: 150 },
  kpi3: { x: 160, y: 0 },
  quotes: { x: -160, y: 0 },
  templates: { x: 0, y: 150 },
} satisfies Record<string, Dir>;

const ease = [0.16, 1, 0.3, 1] as const;
const spring = { type: "spring", stiffness: 260, damping: 28, mass: 0.9 } as const;

function useOvMotion() {
  const reduced = useReducedMotion() ?? false;
  const { leaving } = useSectionTransition();
  const grid: Variants = reduced
    ? { hidden: {}, show: {}, exit: {} }
    : { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } }, exit: { transition: { staggerChildren: 0.05, staggerDirection: -1 } } };
  const item: Variants = reduced
    ? { hidden: { opacity: 1, x: 0, y: 0, scale: 1 }, show: { opacity: 1, x: 0, y: 0, scale: 1, transition: { duration: 0 } }, exit: { opacity: 1 } }
    : {
        hidden: (d: Dir = { x: 0, y: 150 }) => ({ opacity: 0, x: d.x, y: d.y, scale: 0.96 }),
        show: { opacity: 1, x: 0, y: 0, scale: 1, transition: { ...spring, opacity: { duration: 0.35, ease } } },
        exit: (d: Dir = { x: 0, y: 150 }) => ({ opacity: 0, x: d.x, y: d.y, scale: 0.96, transition: { duration: 0.34, ease: [0.55, 0, 0.75, 0.2] } }),
      };
  const lift = reduced || leaving ? undefined : { y: -4, transition: { duration: 0.25, ease } };
  return { reduced, leaving, grid, item, lift };
}

export function OverviewMotion({ children }: { children: ReactNode }) {
  return (
    <SectionTransitionProvider interceptLinks>
      <OverviewGrid>{children}</OverviewGrid>
    </SectionTransitionProvider>
  );
}

function OverviewGrid({ children }: { children: ReactNode }) {
  const m = useOvMotion();
  const { visit, leaving } = useSectionTransition();
  return (
    <div className="ov-stage">
      <motion.div key={visit} className={cn("ov", leaving && "is-leaving")} variants={m.grid} initial="hidden" animate={leaving ? "exit" : "show"}>
        {children}
      </motion.div>
    </div>
  );
}

/** Page header: fades and drops in, rises out. */
export function OvHead({ children, className }: { children: ReactNode; className: string }) {
  const m = useOvMotion();
  const variants: Variants = m.reduced
    ? { hidden: { opacity: 1 }, show: { opacity: 1 }, exit: { opacity: 1 } }
    : { hidden: { opacity: 0, y: -16 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } }, exit: { opacity: 0, y: -16, transition: { duration: 0.3, ease } } };
  return (
    <motion.header className={className} variants={variants}>
      {children}
    </motion.header>
  );
}

/** A card of the Overview: flies in from `dir`, lifts on hover (kit). */
export function OvCard({ dir, lift = true, className, children, ...rest }: { dir: Dir; lift?: boolean; className: string; children: ReactNode } & Pick<ComponentProps<"section">, "aria-labelledby">) {
  const m = useOvMotion();
  return (
    <motion.section className={className} variants={m.item} custom={dir} whileHover={lift ? m.lift : undefined} {...rest}>
      {children}
    </motion.section>
  );
}

/** Groups (rows) pass the variants through to their cards. */
export function OvRow({ className, children }: { className: string; children: ReactNode }) {
  return (
    <motion.div className={className} variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09 } }, exit: { transition: { staggerChildren: 0.05, staggerDirection: -1 } } }}>
      {children}
    </motion.div>
  );
}
