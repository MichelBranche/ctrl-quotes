"use client";

import { useState } from "react";
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
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Calculator,
  Copy,
  Eye,
  EyeOff,
  FileSignature,
  GripVertical,
  Image as ImageIcon,
  Layers,
  LayoutPanelTop,
  ListChecks,
  Plus,
  Trash2,
  Type,
  UserRound,
} from "lucide-react";
import { ActionMenu } from "@/components/data/menu";
import { blockHint, blockLabel, blockTypes, singletonBlocks, type BlockType, type QuoteBlock } from "@/domain/quote-document";
import { cn } from "@/lib/cn";

export const blockIcon: Record<BlockType, typeof Type> = {
  cover: LayoutPanelTop,
  intro: Type,
  text: AlignLeft,
  image: ImageIcon,
  services: Layers,
  options: ListChecks,
  summary: Calculator,
  terms: FileSignature,
  contacts: UserRound,
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
  onAdd,
}: {
  blocks: QuoteBlock[];
  selectedId: string | null;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onReorder: (blocks: QuoteBlock[]) => void;
  onToggle: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: (type: BlockType) => void;
}) {
  const [adding, setAdding] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const present = new Set(blocks.map((block) => block.type));

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = blocks.findIndex((block) => block.id === active.id);
    const to = blocks.findIndex((block) => block.id === over.id);
    if (from >= 0 && to >= 0) onReorder(arrayMove(blocks, from, to));
  }

  function move(id: string, delta: -1 | 1) {
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
              <li key={type}>
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
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
          <ol className="block-list" aria-label="Blocchi del preventivo">
            {blocks.map((block, index) => (
              <SortableBlock
                key={block.id}
                block={block}
                selected={block.id === selectedId}
                readOnly={readOnly}
                first={index === 0}
                last={index === blocks.length - 1}
                onSelect={() => onSelect(block.id)}
                onToggle={() => onToggle(block.id)}
                onDuplicate={() => onDuplicate(block.id)}
                onRemove={() => onRemove(block.id)}
                onMove={(delta) => move(block.id, delta)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <p className="muted small panel-foot">Trascina per riordinare, oppure usa le frecce del menu. I blocchi nascosti restano nella bozza ma non nel documento.</p>
    </section>
  );
}

function SortableBlock({
  block,
  selected,
  readOnly,
  first,
  last,
  onSelect,
  onToggle,
  onDuplicate,
  onRemove,
  onMove,
}: {
  block: QuoteBlock;
  selected: boolean;
  readOnly: boolean;
  first: boolean;
  last: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled: readOnly });
  const Icon = blockIcon[block.type];
  const title = blockTitle(block);
  const singleton = singletonBlocks.has(block.type);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("block-item", selected && "is-selected", !block.visible && "is-hidden", isDragging && "is-dragging")}
    >
      <button type="button" className="drag-handle" aria-label={`Sposta ${title}`} disabled={readOnly} {...attributes} {...listeners}>
        <GripVertical size={14} aria-hidden="true" />
      </button>
      <button type="button" className="block-select" onClick={onSelect} aria-current={selected ? "true" : undefined}>
        <Icon size={16} aria-hidden="true" />
        <span className="clamp-1">{title}</span>
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
      {readOnly ? null : (
        <ActionMenu
          label={`Azioni per ${title}`}
          items={[
            { label: "Sposta su", icon: <ArrowUp size={16} aria-hidden="true" />, onSelect: () => onMove(-1), disabledReason: first ? "È già il primo blocco." : undefined },
            { label: "Sposta giù", icon: <ArrowDown size={16} aria-hidden="true" />, onSelect: () => onMove(1), disabledReason: last ? "È già l'ultimo blocco." : undefined },
            {
              label: "Duplica",
              icon: <Copy size={16} aria-hidden="true" />,
              onSelect: onDuplicate,
              disabledReason: singleton ? "Questo blocco può comparire una sola volta." : undefined,
            },
            { label: "Elimina", icon: <Trash2 size={16} aria-hidden="true" />, danger: true, onSelect: onRemove },
          ]}
        />
      )}
    </li>
  );
}
