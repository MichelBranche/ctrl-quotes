"use client";

import { useReducedMotion, type Variants } from "motion/react";

/* Shared card choreography for the sections that build up card by card (section-transition.tsx drives
   visit/leaving): each card arrives from its own direction with stagger and spring, leaves in reverse order. */
export type Dir = { x: number; y: number };
export const FROM_TOP: Dir = { x: 0, y: -140 };
export const FROM_BOTTOM: Dir = { x: 0, y: 150 };
export const FROM_LEFT: Dir = { x: -160, y: 0 };
export const FROM_RIGHT: Dir = { x: 160, y: 0 };

export const cardEase = [0.16, 1, 0.3, 1] as const;
const spring = { type: "spring", stiffness: 260, damping: 28, mass: 0.9 } as const;

/** `cards`: how many cards stagger; long lists stagger faster so the exit ends within SECTION_EXIT_MS. */
export function useCardMotion(cards = 4) {
  const reduced = useReducedMotion() ?? false;
  const grid: Variants = reduced
    ? { hidden: {}, show: {}, exit: {} }
    : {
        hidden: {},
        show: { transition: { staggerChildren: Math.min(0.09, 0.6 / Math.max(1, cards)), delayChildren: 0.05 } },
        exit: { transition: { staggerChildren: Math.min(0.06, 0.16 / Math.max(1, cards - 1)), staggerDirection: -1 } },
      };
  const item: Variants = reduced
    ? { hidden: { opacity: 1, x: 0, y: 0, scale: 1 }, show: { opacity: 1, x: 0, y: 0, scale: 1, transition: { duration: 0 } }, exit: { opacity: 1 } }
    : {
        hidden: (d: Dir) => ({ opacity: 0, x: d.x, y: d.y, scale: 0.97 }),
        show: { opacity: 1, x: 0, y: 0, scale: 1, transition: { ...spring, opacity: { duration: 0.35, ease: cardEase } } },
        exit: (d: Dir) => ({ opacity: 0, x: d.x, y: d.y, scale: 0.97, transition: { duration: 0.34, ease: [0.55, 0, 0.75, 0.2] } }),
      };
  /** Page title: fades down on arrival, back up on exit. */
  const head = (leaving: boolean) => ({
    initial: reduced ? false : { opacity: 0, y: -16 },
    animate: leaving && !reduced ? { opacity: 0, y: -16 } : { opacity: 1, y: 0 },
    transition: { duration: leaving ? 0.3 : 0.5, ease: cardEase },
  });
  /** Kit hover for small cards: a short lift. */
  const lift = reduced ? undefined : { y: -4, transition: { duration: 0.25, ease: cardEase } };
  return { reduced, grid, item, head, lift };
}
