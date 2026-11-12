"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { formatEuro } from "@/domain/money";

/** A euro amount that counts to its new value in 450 ms; screen readers only hear the final figure. */
export function CountUp({ cents, suffix }: { cents: number; suffix: string }) {
  const reduced = useReducedMotion();
  const value = useMotionValue(cents);
  const text = useTransform(value, (current) => `${formatEuro(Math.round(current))}${suffix}`);
  useEffect(() => {
    if (reduced) {
      value.set(cents);
      return;
    }
    const controls = animate(value, cents, { duration: 0.45, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [cents, reduced, value]);
  return (
    <strong>
      <motion.span aria-hidden="true">{text}</motion.span>
      <span className="visually-hidden">{`${formatEuro(cents)}${suffix}`}</span>
    </strong>
  );
}
