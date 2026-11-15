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
import { EyeOff, Lock, MoreHorizontal, Plus } from "lucide-react";
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
  onRemove?: (id: string) => void;
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
        title: `${blockTitle(block)} (${blockLabel[block.type]}${block.visible ? "" : ", nascosto"}${block.locked ? ", bloccato" : ""})`,
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
          rowHeight={36}
          indent={40}
          trunk={14}
          radius={10}
          lineWidth={1.5}
          fontSize={14}
          drawDuration={400}
          foldDuration={300}
          lineColor="#d4d4d8"
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
                      {/* Hidden or locked: a small state toggle stays on the row. */}
                      {block.visible ? null : (
                        <button type="button" className="ve-outline-act" data-on aria-pressed="true" aria-label={`Mostra ${title}`} title="Nascosto: clic per mostrarlo" onClick={() => onToggle(block.id)}>
                          <EyeOff size={13} aria-hidden="true" />
                        </button>
                      )}
                      {locked ? (
                        <button type="button" className="ve-outline-act" data-on aria-pressed="true" aria-label={`Sblocca ${title}`} title="Contenuto bloccato: clic per sbloccare" onClick={() => onLock(block.id, false)}>
                          <Lock size={13} aria-hidden="true" />
                        </button>
                      ) : null}
                      {onMenu ? (
                        <button
                          type="button"
                          className="ve-outline-act is-more"
                          aria-label={`Azioni su ${title}`}
                          aria-haspopup="menu"
                          title="Nascondi, blocca, sposta, elimina"
                          onClick={(event) => {
                            const box = event.currentTarget.getBoundingClientRect();
                            onMenu(block.id, box.right - 4, box.bottom + 4);
                          }}
                        >
                          <MoreHorizontal size={15} aria-hidden="true" />
                        </button>
                      ) : null}
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
