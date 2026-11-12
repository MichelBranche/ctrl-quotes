"use client";

import { useId, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PanelRightClose } from "lucide-react";
import { cn } from "@/lib/cn";

export type PanelTab = "content" | "style";

const tabs: Array<[PanelTab, string]> = [
  ["content", "Contenuto"],
  ["style", "Stile"],
];

/**
 * The right panel of the visual editor: what is selected, in two tabs. "Contenuto" holds the fields,
 * "Stile" the choices for the block and for the whole document. Presentation only: nothing new is saved.
 */
export function SidePanel({
  tab,
  onTab,
  onClose,
  title,
  subtitle,
  content,
  style,
  reduced,
  contextKey,
}: {
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  onClose: () => void;
  title: string;
  subtitle: string;
  content: React.ReactNode;
  style: React.ReactNode;
  reduced: boolean;
  /** Changes with the selection, so the body cross-fades when it switches. */
  contextKey: string;
}) {
  const id = useId();
  const refs = useRef(new Map<PanelTab, HTMLButtonElement>());

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const at = tabs.findIndex(([key]) => key === tab);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (at + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const key = tabs[next]?.[0];
    if (!key) return;
    onTab(key);
    refs.current.get(key)?.focus();
  };

  return (
    <motion.aside
      className="ve-panel"
      aria-label="Pannello delle proprietà"
      data-testid="ve-panel"
      initial={reduced ? false : { opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="ve-panel-head">
        <div className="ve-panel-tabs" role="tablist" aria-label="Sezioni del pannello" onKeyDown={onKeyDown}>
          {tabs.map(([key, label]) => (
            <button
              key={key}
              ref={(node) => {
                if (node) refs.current.set(key, node);
                else refs.current.delete(key);
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`${id}-panel`}
              tabIndex={tab === key ? 0 : -1}
              className={cn("ve-panel-tab", tab === key && "is-active")}
              onClick={() => onTab(key)}
            >
              {tab === key ? <motion.span layoutId={`${id}-pill`} className="ve-panel-pill" transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }} /> : null}
              <span className="ve-panel-tab-label">{label}</span>
            </button>
          ))}
        </div>
        <button type="button" className="icon-btn" aria-label="Chiudi il pannello" title="Chiudi il pannello" onClick={onClose}>
          <PanelRightClose size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="ve-panel-title">
        <h2>{title}</h2>
        <p className="muted small">{subtitle}</p>
      </div>
      <div className="ve-panel-body" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${tab}:${contextKey}`}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4, transition: { duration: 0.08 } }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            {tab === "content" ? content : style}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}
