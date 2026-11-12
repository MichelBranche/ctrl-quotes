"use client";

import { motion, useReducedMotion } from "motion/react";
import { MousePointer2, Rows3 } from "lucide-react";
import type { EditorMode } from "./mode";

const options = [
  { mode: "modulo", label: "Modulo", Icon: Rows3 },
  { mode: "visuale", label: "Visuale", Icon: MousePointer2 },
] as const;

/** Modulo and Visuale, with a pill that slides between them. */
export function ModeToggle({ mode, capable, onMode }: { mode: EditorMode; capable: boolean; onMode: (mode: EditorMode) => void }) {
  const reduced = useReducedMotion();
  return (
    <div className="mode-toggle" role="group" aria-label="Modalità dell'editor">
      {options.map(({ mode: value, label, Icon }) => {
        const active = mode === value;
        const unavailable = value === "visuale" && !capable;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            disabled={unavailable}
            title={unavailable ? "La modalità visuale è disponibile da computer, con una finestra larga almeno 1180 px." : undefined}
            onClick={() => onMode(value)}
          >
            {active ? (
              <motion.span
                layoutId="mode-pill"
                className="mode-pill"
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }}
                aria-hidden="true"
              />
            ) : null}
            <span className="mode-label">
              <Icon size={14} aria-hidden="true" /> {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
