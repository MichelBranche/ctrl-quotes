"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { fontCssHref, fontFamilyName, type FontRef } from "@/domain/fonts";
import { FontPicker, useCatalog } from "./font-picker";

/** A field that shows the chosen font in its own face and opens the font library. */
export function FontSelect({
  label,
  value,
  onChange,
  disabled,
  emptyLabel = "Font del template",
  brand = [],
}: {
  label: string;
  value: FontRef | null;
  onChange: (ref: FontRef | null) => void;
  disabled?: boolean;
  emptyLabel?: string;
  brand?: Array<{ ref: FontRef; role: string }>;
}) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const catalog = useCatalog();
  const name = value ? (catalog?.find((entry) => entry.ref === value)?.name ?? value.slice(value.indexOf(":") + 1)) : emptyLabel;
  const href = value ? fontCssHref([value], { preview: true }) : null;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (root.current && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const labelId = `fs-${useId().replace(/:/g, "")}`;

  return (
    <div ref={root} className="fs-field">
      {href ? <link rel="stylesheet" href={href} precedence="cq-fonts" /> : null}
      <span className="field-label" id={`${labelId}-label`}>{label}</span>
      <button type="button" id={labelId} className="fs-button" aria-labelledby={`${labelId}-label ${labelId}`} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)}>
        <span className="clamp-1" style={value ? { fontFamily: `"${fontFamilyName(value)}", system-ui, sans-serif` } : undefined}>
          {name}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            className="fs-pop"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
          >
            <FontPicker
              value={value}
              brand={brand}
              onPick={(ref) => {
                onChange(ref);
                setOpen(false);
              }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
