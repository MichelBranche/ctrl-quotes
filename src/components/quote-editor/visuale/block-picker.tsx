"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Search } from "lucide-react";
import { blockHint, blockLabel, singletonBlocks, type BlockType } from "@/domain/quote-document";
import { cn } from "@/lib/cn";
import { blockIcon } from "../block-list";
import { revealInCanvas } from "./geometry";

const content: BlockType[] = ["text", "image", "services", "options", "highlights", "terms", "intro"];
const once: BlockType[] = ["summary", "timeline", "contacts", "cover"];

/** Block chooser opened from a "+" on the sheet: search, arrows and Enter, unique blocks greyed out. */
export function BlockPicker({
  position,
  present,
  where,
  onPick,
  onClose,
}: {
  position: { x: number; y: number };
  present: Set<BlockType>;
  where: string;
  onPick: (type: BlockType) => void;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const match = (type: BlockType) => {
    const q = query.trim().toLowerCase();
    return !q || `${blockLabel[type]} ${blockHint[type]}`.toLowerCase().includes(q);
  };
  const groups = [
    { title: "Contenuti", types: content.filter(match) },
    { title: "Una sola volta per preventivo", types: once.filter(match) },
  ].filter((group) => group.types.length);
  const enabled = groups.flatMap((group) => group.types).filter((type) => !(singletonBlocks.has(type) && present.has(type)));
  const current = enabled[Math.min(active, enabled.length - 1)];

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(() => revealInCanvas(panel.current, Boolean(reduced)));
    const onPointer = (event: PointerEvent) => {
      if (panel.current && event.target instanceof Node && panel.current.contains(event.target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [onClose, reduced]);

  return (
    <motion.div
      ref={panel}
      className="ve-picker"
      data-ve-ui=""
      role="dialog"
      aria-label="Aggiungi blocco"
      style={{ left: position.x, top: position.y }}
      initial={reduced ? false : { opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const delta = event.key === "ArrowDown" ? 1 : -1;
          setActive((value) => (enabled.length ? (Math.min(value, enabled.length - 1) + delta + enabled.length) % enabled.length : 0));
        } else if (event.key === "Enter" && current) {
          event.preventDefault();
          onPick(current);
        }
      }}
    >
      <div className="ve-picker-search">
        <Search size={15} aria-hidden="true" />
        <input
          ref={input}
          type="search"
          value={query}
          placeholder="Cerca un blocco"
          aria-label="Cerca un blocco"
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
        />
      </div>
      {groups.length === 0 ? <p className="ve-picker-empty muted small">Nessun blocco con questo nome.</p> : null}
      {groups.map((group) => (
        <div key={group.title} className="ve-picker-group">
          <p className="ve-picker-title">{group.title}</p>
          <ul className="ve-picker-grid">
            {group.types.map((type) => {
              const Icon = blockIcon[type];
              const taken = singletonBlocks.has(type) && present.has(type);
              const itemIndex = enabled.indexOf(type);
              return (
                <motion.li key={type} initial={reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduced ? 0 : 0.02 * (itemIndex + 1), duration: 0.14 }}>
                  <button
                    type="button"
                    className={cn("ve-picker-item", current === type && !taken && "is-active")}
                    disabled={taken}
                    onMouseEnter={() => itemIndex >= 0 && setActive(itemIndex)}
                    onClick={() => onPick(type)}
                  >
                    <span className="ve-picker-icon">
                      <Icon size={15} aria-hidden="true" />
                    </span>
                    <span className="ve-picker-text">
                      <strong>{blockLabel[type]}</strong>
                      <span>{taken ? "Già presente" : blockHint[type]}</span>
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="ve-picker-foot">
        <span>Frecce per scegliere · Invio per inserire</span>
        <span>{where}</span>
      </div>
    </motion.div>
  );
}
