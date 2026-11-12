"use client";

import { useEffect, useRef, useState } from "react";
import { Reorder, useDragControls, useReducedMotion } from "motion/react";
import { CheckCircle2, Eye, EyeOff, GripVertical, LoaderCircle, Lock, LockOpen, Pin, Plus, Trash2 } from "lucide-react";
import { blockLabel, type QuoteBlock } from "@/domain/quote-document";
import { cn } from "@/lib/cn";
import { blockIcon, blockTitle } from "../block-list";

export type OutlineGroup = { key: "cover" | "content" | "summary"; label: string; blocks: QuoteBlock[] };

/**
 * Blocks grouped by the sheet they print on, from the document order alone: the cover has its
 * own sheet, the blocks before the Riepilogo share the next one, the Riepilogo and what follows
 * start a new one (as every template paginates). A hidden block keeps its place in its group, so
 * hiding and showing it again never moves it.
 */
export function outlineGroups(blocks: QuoteBlock[]): OutlineGroup[] {
  const summaryAt = blocks.findIndex((block) => block.type === "summary");
  const parts: OutlineGroup[] = [
    { key: "cover", label: "", blocks: blocks.filter((block) => block.type === "cover") },
    { key: "content", label: "", blocks: blocks.filter((block, index) => block.type !== "cover" && (summaryAt < 0 || index < summaryAt)) },
    { key: "summary", label: "", blocks: summaryAt < 0 ? [] : blocks.filter((block, index) => block.type !== "cover" && index >= summaryAt) },
  ];
  const summary = summaryAt < 0 ? undefined : blocks[summaryAt];
  let page = 0;
  const groups: OutlineGroup[] = [];
  for (const part of parts) {
    if (part.blocks.length === 0) continue;
    const prints = part.blocks.some((block) => block.visible);
    // With the Riepilogo hidden, what follows it prints on the same sheet as the content.
    const ownSheet = part.key !== "summary" || Boolean(summary?.visible);
    if (prints && ownSheet) page += 1;
    const label = !prints ? "Nascosti, non in stampa" : `Pagina ${Math.max(page, 1)}${part.key === "summary" && ownSheet && page > 1 ? " · dal Riepilogo" : ""}`;
    groups.push({ ...part, label });
  }
  return groups;
}

type RowActions = {
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onLock: (id: string, locked: boolean) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
};

export function Outline({
  blocks,
  selectedId,
  draggingId,
  readOnly,
  totalLabel,
  totalValue,
  fromServer,
  onReorder,
  onAdd,
  ...actions
}: RowActions & {
  blocks: QuoteBlock[];
  selectedId: string | null;
  /** A block being dragged on the sheet: the outline shows its proposed order and does not drag. */
  draggingId: string | null;
  readOnly: boolean;
  totalLabel: string;
  totalValue: string;
  fromServer: boolean;
  /** Commits a new order from a drag in the outline; returns false when it is refused. */
  onReorder: (ids: string[], movedId: string) => boolean;
  onAdd: () => void;
}) {
  const [live, setLive] = useState<string[] | null>(null);
  const liveRef = useRef<string[] | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const ids = live ?? blocks.map((block) => block.id);
  const ordered = ids.map((id) => byId.get(id)).filter((block): block is QuoteBlock => Boolean(block));
  const coverId = blocks.find((block) => block.type === "cover")?.id ?? null;
  const labelOf = new Map<string, string>();
  for (const group of outlineGroups(ordered)) {
    const first = group.blocks.find((block) => block.id !== held);
    if (first) labelOf.set(first.id, group.label);
  }

  const settleRef = useRef<(id: string) => void>(() => {});
  const settle = (id: string) => {
    const next = liveRef.current;
    liveRef.current = null;
    setHeld(null);
    if (next && next.join() !== blocks.map((block) => block.id).join()) onReorder(next, id);
    setLive(null);
  };

  // A press on the grip that never turns into a drag ends with no drag event: release it here.
  useEffect(() => {
    if (!held) return;
    const id = held;
    let timer = 0;
    const onUp = () => {
      timer = window.setTimeout(() => settleRef.current(id), 60);
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [held]);
  useEffect(() => {
    settleRef.current = settle;
  });

  return (
    <aside className="ve-outline" aria-label="Struttura del preventivo">
      <div className="ve-outline-head">
        <h2>Struttura</h2>
        <span className="muted small">{blocks.length} blocchi</span>
      </div>
      <nav className="ve-outline-list">
        <Reorder.Group
          as="ul"
          axis="y"
          values={ids}
          onReorder={(next: string[]) => {
            // The cover stays in opening position: an order that moves it is ignored.
            if (coverId && next[0] !== coverId) return;
            liveRef.current = next;
            setLive(next);
          }}
        >
          {ordered.map((block, index) => (
            <OutlineRow
              key={block.id}
              block={block}
              label={labelOf.get(block.id) ?? null}
              selected={selectedId === block.id}
              dragging={draggingId === block.id || held === block.id}
              canDrag={!readOnly && !draggingId && block.type !== "cover"}
              readOnly={readOnly}
              first={index === 0 || (index === 1 && Boolean(coverId))}
              last={index === ordered.length - 1}
              onHold={() => {
                liveRef.current = ids;
                setHeld(block.id);
              }}
              onDrop={() => settle(block.id)}
              {...actions}
            />
          ))}
        </Reorder.Group>
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

function OutlineRow({
  block,
  label,
  selected,
  dragging,
  canDrag,
  readOnly,
  first,
  last,
  onHold,
  onDrop,
  onSelect,
  onToggle,
  onLock,
  onRemove,
  onMove,
}: RowActions & {
  block: QuoteBlock;
  label: string | null;
  selected: boolean;
  dragging: boolean;
  canDrag: boolean;
  readOnly: boolean;
  first: boolean;
  last: boolean;
  onHold: () => void;
  onDrop: () => void;
}) {
  const controls = useDragControls();
  const reduced = useReducedMotion();
  const Icon = blockIcon[block.type];
  const title = blockTitle(block);
  const cover = block.type === "cover";
  const locked = Boolean(block.locked);
  return (
    <Reorder.Item
      as="li"
      value={block.id}
      dragListener={false}
      dragControls={controls}
      layout="position"
      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 560, damping: 44 }}
      whileDrag={reduced ? undefined : { scale: 1.03, boxShadow: "0 12px 28px -10px rgb(30 20 80 / 0.32), 0 2px 6px rgb(15 15 30 / 0.08)", zIndex: 3 }}
      onDragEnd={onDrop}
      className="ve-outline-row"
      data-block-id={block.id}
    >
      {label ? <p className="ve-outline-page">{label}</p> : null}
      <div className={cn("ve-outline-item", selected && "is-selected", !block.visible && "is-hidden", locked && "is-locked", dragging && "is-dragging")}>
        {cover ? (
          <span className="ve-outline-pin" title="La copertina resta sempre in apertura: non si sposta.">
            <Pin size={12} aria-hidden="true" />
            <span className="visually-hidden">Posizione fissa</span>
          </span>
        ) : (
          <button
            type="button"
            className="ve-outline-grip"
            aria-label={`Sposta ${title}: trascina, oppure frecce su e giù`}
            title="Trascina per riordinare"
            disabled={!canDrag}
            onPointerDown={(event) => {
              if (!canDrag) return;
              event.preventDefault();
              onHold();
              controls.start(event);
            }}
            onKeyDown={(event) => {
              if (!canDrag) return;
              if (event.key === "ArrowUp" && !first) {
                event.preventDefault();
                onMove(block.id, -1);
              } else if (event.key === "ArrowDown" && !last) {
                event.preventDefault();
                onMove(block.id, 1);
              }
            }}
          >
            <GripVertical size={13} aria-hidden="true" />
          </button>
        )}
        <button type="button" className="ve-outline-select" aria-current={selected || undefined} onClick={() => onSelect(block.id)} title={blockLabel[block.type]}>
          <Icon size={14} aria-hidden="true" />
          <span className="clamp-1">{title}</span>
        </button>
        {readOnly ? null : (
          <span className="ve-outline-actions">
            <button
              type="button"
              className="ve-outline-act"
              aria-label={block.visible ? `Nascondi ${title}` : `Mostra ${title}`}
              title={block.visible ? "Nascondi nel documento" : "Mostra nel documento"}
              aria-pressed={!block.visible}
              data-on={!block.visible || undefined}
              onClick={() => onToggle(block.id)}
            >
              {block.visible ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
            </button>
            <button
              type="button"
              className="ve-outline-act"
              aria-label={locked ? `Sblocca ${title}` : `Blocca ${title}`}
              title={locked ? "Contenuto bloccato: clic per sbloccare" : "Blocca il contenuto contro le modifiche"}
              aria-pressed={locked}
              data-on={locked || undefined}
              onClick={() => onLock(block.id, !locked)}
            >
              {locked ? <Lock size={13} aria-hidden="true" /> : <LockOpen size={13} aria-hidden="true" />}
            </button>
            <button
              type="button"
              className="ve-outline-act is-danger"
              aria-label={`Elimina ${title}`}
              title={locked ? "Sblocca il blocco per eliminarlo" : "Elimina"}
              disabled={locked}
              onClick={() => onRemove(block.id)}
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </span>
        )}
      </div>
    </Reorder.Item>
  );
}
