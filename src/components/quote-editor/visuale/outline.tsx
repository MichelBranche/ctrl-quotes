"use client";

import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, Eye, EyeOff, LoaderCircle, Lock, Plus } from "lucide-react";
import { blockLabel, type QuoteBlock } from "@/domain/quote-document";
import { cn } from "@/lib/cn";
import { blockIcon, blockTitle } from "../block-list";

export type OutlineGroup = { page: number; label: string; blocks: QuoteBlock[] };

/**
 * Blocks grouped by the sheet they print on. Hidden blocks stay with the block before them.
 */
export function outlineGroups(blocks: QuoteBlock[], pageOf: Map<string, number>, summaryId: string | null, floating: string | null = null): OutlineGroup[] {
  const groups: OutlineGroup[] = [];
  let page = 0;
  // The dragged block shows on the page of the block it would sit above (its slot opens there).
  const at = floating ? blocks.findIndex((block) => block.id === floating) : -1;
  const below = at >= 0 ? blocks.slice(at + 1).find((block) => (pageOf.get(block.id) ?? -1) >= 0) : undefined;
  for (const block of blocks) {
    const printed = block.id === floating ? (below ? pageOf.get(below.id) : undefined) : pageOf.get(block.id);
    if (printed !== undefined && printed >= 0) page = printed;
    const last = groups[groups.length - 1];
    if (last && last.page === page) last.blocks.push(block);
    else groups.push({ page, label: `Pagina ${page + 1}`, blocks: [block] });
  }
  for (const group of groups) {
    if (summaryId && group.blocks[0]?.id === summaryId && group.page > 1) group.label = `${group.label} · dal Riepilogo`;
  }
  return groups;
}

export function Outline({
  blocks,
  groups,
  selectedId,
  draggingId,
  readOnly,
  totalLabel,
  totalValue,
  fromServer,
  onSelect,
  onToggle,
  onAdd,
}: {
  blocks: QuoteBlock[];
  groups: OutlineGroup[];
  selectedId: string | null;
  draggingId: string | null;
  readOnly: boolean;
  totalLabel: string;
  totalValue: string;
  fromServer: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onAdd: () => void;
}) {
  const reduced = useReducedMotion();
  const layout = reduced ? { duration: 0 } : { type: "spring" as const, stiffness: 520, damping: 42 };
  return (
    <aside className="ve-outline" aria-label="Struttura del preventivo">
      <div className="ve-outline-head">
        <h2>Struttura</h2>
        <span className="muted small">{blocks.length} blocchi</span>
      </div>
      <nav className="ve-outline-list">
        {groups.map((group) => (
          <div key={`${group.page}:${group.blocks[0]?.id ?? ""}`} className="ve-outline-group">
            <p className="ve-outline-page">{group.label}</p>
            <ul>
              {group.blocks.map((block) => {
                const Icon = blockIcon[block.type];
                return (
                  <motion.li key={block.id} layout="position" transition={layout}>
                    <div className={cn("ve-outline-item", selectedId === block.id && "is-selected", !block.visible && "is-hidden", draggingId === block.id && "is-dragging")}>
                      <button type="button" className="ve-outline-select" aria-current={selectedId === block.id || undefined} onClick={() => onSelect(block.id)} title={blockLabel[block.type]}>
                        <Icon size={14} aria-hidden="true" />
                        <span className="clamp-1">{blockTitle(block)}</span>
                      </button>
                      {block.type === "cover" ? (
                        <Lock size={13} aria-label="La copertina resta in apertura" className="ve-outline-lock" />
                      ) : !readOnly ? (
                        <button
                          type="button"
                          className="ve-outline-eye"
                          aria-label={block.visible ? `Nascondi ${blockTitle(block)}` : `Mostra ${blockTitle(block)}`}
                          title={block.visible ? "Nascondi nel documento" : "Mostra nel documento"}
                          onClick={() => onToggle(block.id)}
                        >
                          {block.visible ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
                        </button>
                      ) : null}
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        ))}
        {readOnly ? null : (
          <button type="button" className="ve-outline-add" onClick={onAdd}>
            <Plus size={14} aria-hidden="true" /> Aggiungi blocco
          </button>
        )}
      </nav>
      <div className="ve-total" aria-live="polite">
        <span className="muted small">{totalLabel}</span>
        <strong>{totalValue}</strong>
        <span className={cn("ve-total-source small", fromServer && "is-server")}>
          {fromServer ? <CheckCircle2 size={13} aria-hidden="true" /> : <LoaderCircle size={13} aria-hidden="true" className="spin" />}
          {fromServer ? "Calcolato dal server" : "Verifica in corso"}
        </span>
      </div>
    </aside>
  );
}
