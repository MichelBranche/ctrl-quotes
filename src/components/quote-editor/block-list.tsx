"use client";

import { Fragment, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, ArrowDown, ArrowUp, Columns2, Columns3, Unlink, Calculator, CalendarRange, ChartBarBig, ChartGantt, ChartPie, WalletCards, Copy, Eye, EyeOff, Lock, LockOpen, FileSignature, GripVertical, Image as ImageIcon, Layers, LayoutPanelTop, ListChecks, Plus, Sparkles, Trash2, Type, UserRound } from "lucide-react";
import { ActionMenu } from "@/components/data/menu";
import { blockHint, blockLabel, blockTypes, chartBlockTypes, singletonBlocks, type BlockType, type QuoteBlock } from "@/domain/quote-document";
import { cn } from "@/lib/cn";
import { canColumn, layoutChoices, maxColumns, rowOf, spanLabel, unitsOf } from "@/domain/columns";
import type { DocumentCommand } from "@/domain/document-ops";

/** Where a block sits in its row: shown as a bracket on the left, with the width of the column. */
type ColumnPlace = { row: string; count: number; position: "first" | "middle" | "last"; span: number; spans: number[] };

function columnPlaces(blocks: QuoteBlock[]): Map<string, ColumnPlace> {
  const places = new Map<string, ColumnPlace>();
  for (const unit of unitsOf(blocks)) {
    if (unit.kind !== "row") continue;
    const spans = unit.blocks.map((block) => block.col?.span ?? 3);
    unit.blocks.forEach((block, index) => {
      places.set(block.id, { row: unit.row, count: unit.blocks.length, position: index === 0 ? "first" : index === unit.blocks.length - 1 ? "last" : "middle", span: spans[index] ?? 3, spans });
    });
  }
  return places;
}

/** Why "Affianca al blocco sopra" is not possible, or null when it is. */
function besideReason(blocks: QuoteBlock[], index: number): string | null {
  const block = blocks[index];
  const above = blocks[index - 1];
  if (!block || !canColumn(block.type)) return "Questo blocco non va in colonna.";
  if (!above) return "Non c'è un blocco sopra.";
  if (block.col && above.col?.row === block.col.row) return "È già nella riga del blocco sopra.";
  if (!canColumn(above.type)) return "Il blocco sopra non va in colonna.";
  const row = rowOf(blocks, above.id);
  if (row && row.blocks.length >= maxColumns) return `La riga sopra ha già ${maxColumns} colonne.`;
  return null;
}

export const blockIcon: Record<BlockType, typeof Type> = {
  cover: LayoutPanelTop,
  intro: Type,
  text: AlignLeft,
  image: ImageIcon,
  services: Layers,
  options: ListChecks,
  highlights: Sparkles,
  summary: Calculator,
  timeline: CalendarRange,
  terms: FileSignature,
  contacts: UserRound,
  chartCosts: ChartPie,
  chartBars: ChartBarBig,
  chartTimeline: ChartGantt,
  chartPayments: WalletCards,
};

export function blockTitle(block: QuoteBlock): string {
  if (block.type === "cover") return blockLabel.cover;
  if (block.type === "image") return block.caption.trim() || blockLabel.image;
  return block.heading.trim() || blockLabel[block.type];
}

export function BlockList({
  blocks,
  selectedId,
  readOnly,
  onSelect,
  onReorder,
  onToggle,
  onDuplicate,
  onRemove,
  onLock,
  onAdd,
  onCommand,
}: {
  blocks: QuoteBlock[];
  selectedId: string | null;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onReorder: (blocks: QuoteBlock[]) => void;
  onToggle: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onLock: (id: string, locked: boolean) => void;
  onAdd: (type: BlockType) => void;
  /** Rows of columns: join, leave, split, widths, and moving a whole row. */
  onCommand?: (command: DocumentCommand) => void;
}) {
  const [adding, setAdding] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const present = new Set(blocks.map((block) => block.type));
  const places = columnPlaces(blocks);
  const units = unitsOf(blocks);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = blocks.findIndex((block) => block.id === active.id);
    const to = blocks.findIndex((block) => block.id === over.id);
    if (from >= 0 && to >= 0) onReorder(arrayMove(blocks, from, to));
  }

  function move(id: string, delta: -1 | 1) {
    if (onCommand) return onCommand({ kind: "moveUnit", blockId: id, delta });
    const from = blocks.findIndex((block) => block.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= blocks.length) return;
    onReorder(arrayMove(blocks, from, to));
  }

  return (
    <section className="card editor-panel structure-panel" aria-labelledby="structure-title">
      <div className="panel-head">
        <h2 id="structure-title">Struttura</h2>
        <button
          type="button"
          className="icon-btn"
          aria-label="Aggiungi blocco"
          aria-expanded={adding}
          onClick={() => setAdding((value) => !value)}
          disabled={readOnly}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
      {adding && !readOnly ? (
        <ul className="add-block-list" aria-label="Tipi di blocco">
          {blockTypes.map((type) => {
            const Icon = blockIcon[type];
            const disabled = singletonBlocks.has(type) && present.has(type);
            return (
              <li key={type} className={type === chartBlockTypes[0] ? "add-block-group" : undefined} data-group={type === chartBlockTypes[0] ? "Grafici" : undefined}>
                <button
                  type="button"
                  className="add-block"
                  disabled={disabled}
                  title={disabled ? "Questo blocco è già presente." : undefined}
                  onClick={() => {
                    onAdd(type);
                    setAdding(false);
                  }}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>
                    <strong>{blockLabel[type]}</strong>
                    <span className="muted small block">{disabled ? "Già presente" : blockHint[type]}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <DndContext id="block-list" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
          <ol className="block-list" aria-label="Blocchi del preventivo">
            {blocks.map((block, index) => {
              const place = places.get(block.id) ?? null;
              const unit = units.findIndex((entry) => (entry.kind === "row" ? entry.blocks.some((member) => member.id === block.id) : entry.block.id === block.id));
              return (
              <Fragment key={block.id}>
              {place?.position === "first" ? (
                <RowHead place={place} readOnly={readOnly} onLayout={(spans) => onCommand?.({ kind: "setRowLayout", row: place.row, spans })} onSplit={() => onCommand?.({ kind: "splitRow", row: place.row })} />
              ) : null}
              <SortableBlock
                block={block}
                place={place}
                beside={onCommand ? besideReason(blocks, index) ?? "" : null}
                onBeside={() => {
                  const above = blocks[index - 1];
                  if (above) onCommand?.({ kind: "joinRow", blockId: block.id, targetId: above.id, side: "after" });
                }}
                onLeave={() => onCommand?.({ kind: "leaveRow", blockId: block.id })}
                selected={block.id === selectedId}
                readOnly={readOnly}
                first={unit <= 0}
                last={unit === units.length - 1}
                onSelect={() => onSelect(block.id)}
                onToggle={() => onToggle(block.id)}
                onDuplicate={() => onDuplicate(block.id)}
                onRemove={() => onRemove(block.id)}
                onLock={() => onLock(block.id, !block.locked)}
                onMove={(delta) => move(block.id, delta)}
              />
              </Fragment>
              );
            })}
          </ol>
        </SortableContext>
      </DndContext>
      <p className="muted small panel-foot">Trascina per riordinare, oppure usa le frecce del menu. I blocchi nascosti restano nella bozza ma non nel documento; quelli bloccati non si modificano finché non li sblocchi.</p>
    </section>
  );
}

function RowHead({ place, readOnly, onLayout, onSplit }: { place: ColumnPlace; readOnly: boolean; onLayout: (spans: number[]) => void; onSplit: () => void }) {
  const choices = layoutChoices(place.count);
  return (
    <li className="block-row-head">
      <span className="block-row-title">
        {place.count === 3 ? <Columns3 size={13} aria-hidden="true" /> : <Columns2 size={13} aria-hidden="true" />}
        {`Riga · ${place.count} colonne`}
      </span>
      {choices.length > 1 ? (
        <span className="block-row-widths" role="group" aria-label="Larghezze">
          {choices.map((choice) => {
            const on = choice.spans.every((span, index) => place.spans[index] === span);
            return (
              <button key={choice.label} type="button" className={cn("block-row-width", on && "is-on")} aria-pressed={on} aria-label={`Larghezze ${choice.label}`} title={`Larghezze ${choice.label}`} disabled={readOnly} onClick={() => onLayout(choice.spans)}>
                {choice.spans.map((span, index) => (
                  <i key={index} style={{ flexGrow: span }} />
                ))}
              </button>
            );
          })}
        </span>
      ) : null}
      <button type="button" className="block-row-split" onClick={onSplit} disabled={readOnly} title="Separa: i blocchi tornano uno sotto l'altro">
        <Unlink size={13} aria-hidden="true" /> Separa
      </button>
    </li>
  );
}

function SortableBlock({
  block,
  place,
  beside,
  onBeside,
  onLeave,
  selected,
  readOnly,
  first,
  last,
  onSelect,
  onToggle,
  onDuplicate,
  onRemove,
  onLock,
  onMove,
}: {
  block: QuoteBlock;
  place: ColumnPlace | null;
  /** null: no rows here; "": possible; otherwise the reason it is not. */
  beside: string | null;
  onBeside: () => void;
  onLeave: () => void;
  selected: boolean;
  readOnly: boolean;
  first: boolean;
  last: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onLock: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled: readOnly });
  const Icon = blockIcon[block.type];
  const title = blockTitle(block);
  const singleton = singletonBlocks.has(block.type);
  const locked = Boolean(block.locked);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("block-item", selected && "is-selected", !block.visible && "is-hidden", locked && "is-locked", isDragging && "is-dragging", place && "in-row")}
      data-col={place?.position}
    >
      <button type="button" className="drag-handle" aria-label={`Sposta ${title}`} disabled={readOnly} {...attributes} {...listeners}>
        <GripVertical size={14} aria-hidden="true" />
      </button>
      <button type="button" className="block-select" onClick={onSelect} aria-current={selected ? "true" : undefined}>
        <Icon size={16} aria-hidden="true" />
        <span className="clamp-1">{title}</span>
        {place ? <span className="block-col-span" title={`Colonna larga ${spanLabel(place.span)}`}>{spanLabel(place.span)}</span> : null}
      </button>
      <button
        type="button"
        className="icon-btn ghost"
        onClick={onToggle}
        aria-pressed={!block.visible}
        aria-label={block.visible ? `Nascondi ${title}` : `Mostra ${title}`}
        disabled={readOnly}
      >
        {block.visible ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
      </button>
      <button
        type="button"
        className={cn("icon-btn ghost block-lock", locked && "is-on")}
        onClick={onLock}
        aria-pressed={locked}
        aria-label={locked ? `Sblocca ${title}` : `Blocca ${title}`}
        title={locked ? "Contenuto bloccato: clic per sbloccare" : "Blocca il contenuto contro le modifiche"}
        disabled={readOnly}
      >
        {locked ? <Lock size={14} aria-hidden="true" /> : <LockOpen size={14} aria-hidden="true" />}
      </button>
      <button
        type="button"
        className="icon-btn ghost block-trash"
        onClick={onRemove}
        aria-label={`Elimina ${title}`}
        title={locked ? "Sblocca il blocco per eliminarlo" : "Elimina"}
        disabled={readOnly || locked}
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
      {readOnly ? null : (
        <ActionMenu
          label={`Azioni per ${title}`}
          items={[
            { label: place ? "Sposta su la riga" : "Sposta su", icon: <ArrowUp size={16} aria-hidden="true" />, onSelect: () => onMove(-1), disabledReason: first ? "È già il primo blocco." : undefined },
            { label: place ? "Sposta giù la riga" : "Sposta giù", icon: <ArrowDown size={16} aria-hidden="true" />, onSelect: () => onMove(1), disabledReason: last ? "È già l'ultimo blocco." : undefined },
            ...(beside === null
              ? []
              : place && place.position !== "first"
                ? [{ label: "Togli dalla riga", icon: <Unlink size={16} aria-hidden="true" />, onSelect: onLeave }]
                : [
                    { label: "Affianca al blocco sopra", icon: <Columns2 size={16} aria-hidden="true" />, onSelect: onBeside, disabledReason: beside || undefined },
                    ...(place ? [{ label: "Togli dalla riga", icon: <Unlink size={16} aria-hidden="true" />, onSelect: onLeave }] : []),
                  ]),
            {
              label: "Duplica",
              icon: <Copy size={16} aria-hidden="true" />,
              onSelect: onDuplicate,
              disabledReason: singleton ? "Questo blocco può comparire una sola volta." : undefined,
            },
            { label: "Elimina", icon: <Trash2 size={16} aria-hidden="true" />, danger: true, onSelect: onRemove, disabledReason: locked ? "Sblocca il blocco per eliminarlo." : undefined },
          ]}
        />
      )}
    </li>
  );
}
