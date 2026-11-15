"use client";

import type { IconSvgElement } from "@hugeicons/react";
import {
  Analytics01Icon,
  BookOpen01Icon,
  Calendar03Icon,
  ChartBarLineIcon,
  ContactBookIcon,
  CreditCardIcon,
  Image01Icon,
  Invoice01Icon,
  Layout01Icon,
  ListViewIcon,
  Note01Icon,
  PieChartIcon,
  PlusSignSquareIcon,
  StarIcon,
  TextIcon,
} from "@hugeicons/core-free-icons";
import { Eye, EyeOff, Lock, LockOpen, Plus, Trash2 } from "lucide-react";
import { spanLabel, unitsOf } from "@/domain/columns";
import { blockLabel, type BlockType, type QuoteBlock } from "@/domain/quote-document";
import { cn } from "@/lib/cn";
import { BranchedMenu } from "@/components/ui/branched-menu";
import { Status } from "@/components/ui/async-status";
import { CountUp } from "./count-up";
import { blockTitle } from "../block-list";

/** One Hugeicons glyph per block type, for the structure tree. */
export const blockTreeIcon: Record<BlockType, IconSvgElement> = {
  cover: Layout01Icon,
  intro: BookOpen01Icon,
  text: TextIcon,
  image: Image01Icon,
  services: ListViewIcon,
  options: PlusSignSquareIcon,
  highlights: StarIcon,
  summary: Invoice01Icon,
  timeline: Calendar03Icon,
  terms: Note01Icon,
  contacts: ContactBookIcon,
  chartCosts: PieChartIcon,
  chartBars: ChartBarLineIcon,
  chartTimeline: Analytics01Icon,
  chartPayments: CreditCardIcon,
};

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

/** Where a block sits in its row, for the outline: a group header on the first column, a width on each. */
type ColumnInfo = { count: number; position: "first" | "middle" | "last"; span: number };

export function columnInfo(blocks: QuoteBlock[]): Map<string, ColumnInfo> {
  const info = new Map<string, ColumnInfo>();
  for (const unit of unitsOf(blocks)) {
    if (unit.kind !== "row") continue;
    unit.blocks.forEach((block, index) => {
      info.set(block.id, { count: unit.blocks.length, position: index === 0 ? "first" : index === unit.blocks.length - 1 ? "last" : "middle", span: block.col?.span ?? 3 });
    });
  }
  return info;
}

type RowActions = {
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onLock: (id: string, locked: boolean) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  /** Right click (or the menu key) on a row: the same block menu as on the sheet. */
  onMenu?: (id: string, x: number, y: number) => void;
};

export function Outline({
  blocks,
  selectedId,
  draggingId,
  readOnly,
  totalLabel,
  total,
  fromServer,
  onReorder,
  onAdd,
  onSelect,
  onToggle,
  onLock,
  onRemove,
  onMove,
  onMenu,
}: RowActions & {
  blocks: QuoteBlock[];
  selectedId: string | null;
  /** A block being dragged on the sheet: the outline shows its proposed order and does not drag. */
  draggingId: string | null;
  readOnly: boolean;
  totalLabel: string;
  total: { cents: number; suffix: string };
  fromServer: boolean;
  /** Commits a new order from a drag in the outline; returns false when it is refused. */
  onReorder: (ids: string[], movedId: string) => boolean;
  onAdd: () => void;
}) {
  const groups = outlineGroups(blocks);
  const columns = columnInfo(blocks);
  const byId = new Map(blocks.map((block) => [block.id, block]));
  // Pages are the groups, blocks branch off them; a block in a row shows its width.
  const items = groups.map((group) => ({
    label: group.label,
    value: `page:${group.key}`,
    children: group.blocks.map((block) => {
      const column = columns.get(block.id);
      return {
        value: block.id,
        label: blockTitle(block),
        icon: blockTreeIcon[block.type],
        meta: column ? `Col. ${spanLabel(column.span)}` : undefined,
        muted: !block.visible,
        fixed: block.type === "cover" || readOnly || Boolean(draggingId),
        title: `${blockLabel[block.type]}${block.visible ? "" : " · nascosto"}${block.locked ? " · bloccato" : ""}`,
      };
    }),
  }));
  return (
    <aside className="ve-outline" aria-label="Struttura del preventivo">
      <div className="ve-outline-head">
        <h2>Struttura</h2>
        <span className="muted small">{blocks.length} blocchi</span>
      </div>
      <div className="ve-outline-list">
        <BranchedMenu
          aria-label="Pagine e blocchi"
          items={items}
          defaultOpen={items.map((_, index) => index)}
          active={selectedId}
          width="100%"
          rowHeight={34}
          indent={34}
          trunk={10}
          radius={9}
          fontSize={13}
          onSelect={(value) => {
            if (byId.has(value)) onSelect(value);
          }}
          onChildContextMenu={(child, event) => {
            if (!onMenu || event.shiftKey || readOnly) return;
            event.preventDefault();
            onMenu(child.value, event.clientX, event.clientY);
          }}
          onMove={readOnly ? undefined : (id, delta) => onMove(id, delta)}
          onReorder={
            readOnly
              ? undefined
              : (groupIndex, values, moved) => {
                  // The group's new order replaces its slice of the document order.
                  const group = groups[groupIndex];
                  if (!group) return;
                  const inGroup = new Set(group.blocks.map((block) => block.id));
                  const queue = [...values];
                  const ids = blocks.map((block) => (inGroup.has(block.id) ? (queue.shift() ?? block.id) : block.id));
                  onReorder(ids, moved);
                }
          }
          renderActions={
            readOnly
              ? undefined
              : (child) => {
                  const block = byId.get(child.value);
                  if (!block) return null;
                  const title = blockTitle(block);
                  const locked = Boolean(block.locked);
                  return (
                    <>
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
                        title={locked ? "Sblocca il blocco per eliminarlo" : "Elimina (Ctrl+Z per annullare)"}
                        disabled={locked}
                        onClick={() => onRemove(block.id)}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </>
                  );
                }
          }
        />
        {readOnly ? null : (
          <button type="button" className="ve-outline-add" onClick={onAdd}>
            <Plus size={14} aria-hidden="true" /> Aggiungi blocco
          </button>
        )}
      </div>
      <div className="ve-total" aria-live="polite">
        <span className="muted small">{totalLabel}</span>
        <CountUp key={total.suffix} cents={total.cents} suffix={total.suffix} />
        <span className={cn("ve-total-source small", fromServer && "is-server")}>
          <Status status={fromServer ? "done" : "running"} size={14} fontSize={12} label={fromServer ? "Calcolato dal server" : "Verifica in corso"} className="muted" />
        </span>
      </div>
    </aside>
  );
}
