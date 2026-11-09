"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { pageEnter } from "@/lib/motion";

export function PageTransition({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion() ?? false;
  const motionProps = pageEnter(reduced);
  return (
    <motion.div initial={motionProps.initial} animate={motionProps.animate} transition={motionProps.transition}>
      {children}
    </motion.div>
  );
}
