"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, BookOpen, Copy, EyeOff, FileText, GripVertical, Maximize2, Minus, Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
import { QuoteDocumentView } from "@/components/quote-render/quote-document";
import { editKit, readAnchor } from "@/components/quote-render/kit-edit";
import { buildModel, type Resources } from "@/components/quote-render/model";
import { renderers } from "@/components/quote-render/templates";
import { applyCommand, fieldLimit, getField, type DocumentCommand, type EditAnchor, type FieldPath } from "@/domain/document-ops";
import { blankLine, blockLabel, newBlock, type BlockType, type QuoteBlock, type QuoteLine } from "@/domain/quote-document";
import { headlineTotal, type QuoteSnapshot } from "@/domain/quote-snapshot";
import type { PriceMode } from "@/domain/pricing";
import type { QuotableItem } from "@/server/quotes";
import { cn } from "@/lib/cn";
import { BlockForm, CatalogPicker } from "../block-form";
import { blockIcon, blockTitle } from "../block-list";
import type { QuoteDraft } from "../state/use-quote-draft";
import { BlockPicker } from "./block-picker";
import { DragGhost, useBlockDrag } from "./drag";
import { blockElement, cssValue, useGeometry, type BlockBox } from "./geometry";
import { LineCard, type LineFocus } from "./line-card";
import { Outline, outlineGroups } from "./outline";
import { TextSession, anchorSelector } from "./text-session";

const SHEET_PX = (595.28 * 96) / 72;
const zoomSteps = [0.5, 0.75, 0.9, 1, 1.25] as const;
const SPRING = { type: "spring" as const, stiffness: 500, damping: 40 };

type Session = { key: number; anchor: EditAnchor; point: { x: number; y: number } | null; selectAll: boolean };
type LineEdit = { blockId: string; lineId: string; focus: LineFocus };
type Picker = { index: number; x: number; y: number; where: string };

const fieldNames: Record<string, string> = {
  title: "Titolo",
  subtitle: "Sottotitolo",
  tagline: "Descrizione dello studio",
  project: "Progetto",
  heading: "Titolo della sezione",
  body: "Testo",
  lead: "Frase di apertura",
  quote: "Citazione",
  caption: "Didascalia",
  payment: "Pagamento",
  notes: "Note",
  name: "Nome della voce",
  description: "Descrizione della voce",
  label: "Periodo",
  points: "Obiettivo",
};

function fieldName(field: string) {
  const parts = field.split(".");
  return fieldNames[parts[parts.length - 1] ?? ""] ?? fieldNames[parts[0] ?? ""] ?? "Testo";
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable], [role='dialog'], [data-ve-ui]"));
}

/** Section number a block would get in this order, with the template's numbering. 0 when unnumbered. */
function numberIn(snapshot: QuoteSnapshot, order: string[], id: string): number {
  const byId = new Map(snapshot.document.blocks.map((block) => [block.id, block]));
  const blocks = order.map((entry) => byId.get(entry)).filter((block): block is QuoteBlock => Boolean(block));
  const resources: Resources = { logo: null, photo: () => null, image: () => "", watermark: null, versionLabel: null };
  const renderer = renderers[snapshot.template] ?? renderers.minimal;
  const model = buildModel({ ...snapshot, document: { ...snapshot.document, blocks } }, resources, renderer.numbering);
  return model.pages.flat().find((section) => section.id === id)?.no ?? 0;
}

const pad = (value: number) => String(value).padStart(2, "0");

export function VisualeView({
  draft,
  snapshot,
  logoUrl,
  readOnly,
  quoteId,
  items,
  defaults,
}: {
  draft: QuoteDraft;
  snapshot: QuoteSnapshot;
  logoUrl: string | null;
  readOnly: boolean;
  quoteId: string;
  items: QuotableItem[];
  defaults: { taxRateBp: number; priceMode: PriceMode };
}) {
  const { document, run, totals, totalsFromServer, selection, setSelectedId, undo, unsaved } = draft;
  const reduced = Boolean(useReducedMotion());
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  const [lineCellRect, setLineCellRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [zoomChoice, setZoomChoice] = useState<"fit" | number>("fit");
  const [fit, setFit] = useState(1);
  const zoom = zoomChoice === "fit" ? fit : zoomChoice;
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [lineEdit, setLineEdit] = useState<LineEdit | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [catalogFor, setCatalogFor] = useState<string | null>(null);
  const sessionKey = useRef(0);
  const pendingReveal = useRef<string | null>(null);
  const pendingAnchor = useRef<EditAnchor | null>(null);

  const byId = useMemo(() => new Map(document.blocks.map((block) => [block.id, block])), [document.blocks]);
  const order = useMemo(() => document.blocks.map((block) => block.id), [document.blocks]);
  const renderKey = useMemo(() => ({ snapshot, zoom }), [snapshot, zoom]);
  const { geometry, measure, pausedRef } = useGeometry(contentRef, order, renderKey);
  const boxOf = useMemo(() => new Map(geometry.blocks.map((box) => [box.id, box])), [geometry.blocks]);

  // The view fills the window below the editor header; the sheet scrolls inside it.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const size = () => {
      const top = root.getBoundingClientRect().top + window.scrollY;
      root.style.setProperty("--ve-height", `${Math.max(520, window.innerHeight - top - 16)}px`);
    };
    size();
    window.addEventListener("resize", size);
    return () => window.removeEventListener("resize", size);
  }, []);

  // "Adatta": the sheet fills the canvas width, between 50% and 125%.
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const update = () => setFit(Math.round(Math.min(1.25, Math.max(0.5, (scroll.clientWidth - 120) / SHEET_PX)) * 100) / 100);
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(scroll);
    return () => observer?.disconnect();
  }, []);

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (!id) setFieldsOpen(false);
    },
    [setSelectedId],
  );

  const exec = useCallback(
    (command: DocumentCommand, group?: string) => run(command, { order: "template", group }),
    [run],
  );
  const allowed = (command: DocumentCommand) => !readOnly && applyCommand(document, command, { order: "template" }).ok;

  const scrollToBox = useCallback((box: BlockBox | undefined) => {
    const scroll = scrollRef.current;
    if (!box || !scroll) return;
    const top = box.y - 96;
    const bottom = box.y + Math.min(box.h, scroll.clientHeight - 160);
    if (top < scroll.scrollTop || bottom > scroll.scrollTop + scroll.clientHeight) {
      scroll.scrollTo({ top: Math.max(0, top), behavior: reduced ? "auto" : "smooth" });
    }
  }, [reduced]);

  const openAnchor = useCallback(
    (anchor: EditAnchor, point: { x: number; y: number } | null, selectAll = false) => {
      setPicker(null);
      if (anchor.kind === "money" || anchor.kind === "quantity") {
        const [, lineId, key] = anchor.field.split(".");
        if (!lineId || !key) return;
        setSession(null);
        setLineEdit({ blockId: anchor.blockId, lineId, focus: key === "quantityMilli" ? "quantityMilli" : "unitPriceCents" });
        return;
      }
      setLineEdit(null);
      sessionKey.current += 1;
      setSession({ key: sessionKey.current, anchor, point, selectAll });
    },
    [],
  );

  // After an insert or a new line: show the block, open its first field or the field panel.
  useEffect(() => {
    const content = contentRef.current;
    const reveal = pendingReveal.current;
    if (reveal) {
      pendingReveal.current = null;
      const box = boxOf.get(reveal);
      scrollToBox(box);
      const element = blockElement(content, reveal);
      // A new block opens on its first printed text, selected, ready to be typed over.
      const first = element?.querySelector<HTMLElement>('[data-edit-kind="line"], [data-edit-kind="multiline"]');
      const field = first?.dataset.editField as FieldPath | undefined;
      if (box && first && field) openAnchor({ blockId: reveal, field, kind: first.dataset.editKind === "multiline" ? "multiline" : "line" }, null, true);
      else setFieldsOpen(true);
    }
    const anchor = pendingAnchor.current;
    if (anchor && content?.querySelector(anchorSelector(anchor))) {
      pendingAnchor.current = null;
      openAnchor(anchor, null, true);
    }
  }, [geometry.version, boxOf, openAnchor, scrollToBox]);

  // The numbers card hangs under the cell that opened it, also after the table re-renders.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!lineEdit || !content) {
      setLineCellRect(null);
      return;
    }
    const field: FieldPath = `items.${lineEdit.lineId}.${lineEdit.focus === "quantityMilli" ? "quantityMilli" : "unitPriceCents"}`;
    const cell = content.querySelector<HTMLElement>(anchorSelector({ blockId: lineEdit.blockId, field })) ?? content.querySelector<HTMLElement>(`[data-edit-block="${cssValue(lineEdit.blockId)}"][data-edit-field^="items.${cssValue(lineEdit.lineId)}."]`);
    if (!cell) {
      setLineCellRect(null);
      return;
    }
    const rect = cell.getBoundingClientRect();
    const origin = content.getBoundingClientRect();
    const next = { x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height };
    setLineCellRect((current) => (current && Math.abs(current.x - next.x) < 0.5 && Math.abs(current.y - next.y) < 0.5 && Math.abs(current.w - next.w) < 0.5 ? current : next));
  }, [lineEdit, geometry.version]);

  const drag = useBlockDrag({
    contentRef,
    scrollRef,
    zoom,
    blocks: document.blocks,
    boxes: geometry.blocks,
    pausedRef,
    reduced,
    measure,
    onCommit: (ids) => exec({ kind: "reorderBlocks", ids }).ok,
    onSettled: (id) => select(id),
  });

  const dropNumber = useMemo(() => (drag.view ? numberIn(snapshot, drag.view.order, drag.view.id) : 0), [drag.view, snapshot]);

  const selected = selection ? (byId.get(selection) ?? null) : null;
  const selectedBox = selected ? boxOf.get(selected.id) : undefined;
  const selectedIndex = selected ? order.indexOf(selected.id) : -1;

  const moveSelected = (delta: -1 | 1) => {
    if (!selected) return;
    exec({ kind: "moveBlock", blockId: selected.id, toIndex: selectedIndex + delta });
  };
  const duplicateSelected = () => {
    if (!selected) return;
    const result = exec({ kind: "duplicateBlock", blockId: selected.id });
    const copy = result.ok ? result.value.blocks[selectedIndex + 1] : undefined;
    if (copy) {
      select(copy.id);
      pendingReveal.current = copy.id;
    }
  };
  const removeSelected = () => {
    if (!selected) return;
    const label = blockTitle(selected);
    const result = exec({ kind: "removeBlock", blockId: selected.id });
    if (!result.ok) return;
    select(null);
    setSession(null);
    setLineEdit(null);
    toast(`Blocco eliminato: ${label}`, { action: { label: "Annulla", onClick: () => undo() }, duration: 5000 });
  };
  const toggleBlock = (id: string) => exec({ kind: "toggleBlock", blockId: id });

  const insertAt = (type: BlockType, index: number) => {
    const fresh = newBlock(type);
    // On the sheet an empty text block would print nothing to click on: it starts with a title
    // that opens selected, so typing replaces it.
    const block = fresh.type === "text" ? { ...fresh, heading: "Nuovo testo" } : fresh;
    const result = exec({ kind: "insertBlock", block, index });
    setPicker(null);
    if (!result.ok) return;
    select(block.id);
    pendingReveal.current = block.id;
  };

  const addLine = (block: QuoteBlock) => {
    if (block.type !== "services" && block.type !== "options") return;
    const line: QuoteLine = { ...blankLine(defaults), name: "Nuova voce" };
    const result = exec({ kind: "replaceBlock", block: { ...block, items: [...block.items, line] } });
    if (result.ok) pendingAnchor.current = { blockId: block.id, field: `items.${line.id}.name`, kind: "line" };
  };

  const patchLine = (edit: LineEdit, patch: Partial<QuoteLine>) => {
    const block = byId.get(edit.blockId);
    if (!block || (block.type !== "services" && block.type !== "options")) return;
    exec({ kind: "replaceBlock", block: { ...block, items: block.items.map((line) => (line.id === edit.lineId ? { ...line, ...patch } : line)) } }, `line:${edit.lineId}`);
  };
  const removeLine = (edit: LineEdit) => {
    const block = byId.get(edit.blockId);
    if (!block || (block.type !== "services" && block.type !== "options")) return;
    exec({ kind: "replaceBlock", block: { ...block, items: block.items.filter((line) => line.id !== edit.lineId) } });
    setLineEdit(null);
  };

  /** Insertion points between the printed blocks; the cover keeps its page. */
  const flow = geometry.blocks.filter((box) => byId.get(box.id)?.type !== "cover");
  const zones = flow.map((box, index) => {
    const previous = flow[index - 1];
    const y = previous && previous.page === box.page ? (previous.y + previous.h + box.y) / 2 : box.y - 12;
    const before = previous ? byId.get(previous.id) : document.blocks.find((block) => block.type === "cover");
    return { key: `before:${box.id}`, x: box.x, w: box.w, y, index: order.indexOf(box.id), where: before ? `Dopo «${blockTitle(before)}»` : "In apertura" };
  });
  const last = flow[flow.length - 1];
  if (last) {
    const block = byId.get(last.id);
    zones.push({ key: "end", x: last.x, w: last.w, y: last.y + last.h + 16, index: order.indexOf(last.id) + 1, where: block ? `Dopo «${blockTitle(block)}»` : "In fondo" });
  }

  const openPicker = (index: number, x: number, y: number, where: string) => {
    const content = contentRef.current;
    const width = 460;
    const maxX = (content?.clientWidth ?? 900) - width - 12;
    setSession(null);
    setLineEdit(null);
    setPicker({ index, x: Math.max(12, Math.min(maxX, x - width / 2)), y, where });
  };

  const openPickerAfterSelection = () => {
    const box = selectedBox ?? last;
    const index = selected ? selectedIndex + 1 : order.length;
    const where = selected ? `Dopo «${blockTitle(selected)}»` : "In fondo";
    if (box) {
      scrollToBox(box);
      openPicker(index, box.x + box.w / 2, box.y + box.h + 18, where);
    } else {
      openPicker(index, 400, 40, where);
    }
  };

  // Shortcuts of the visual editor. Undo and redo are global (useUndoShortcuts).
  useEffect(() => {
    if (readOnly) return;
    const onKey = (event: KeyboardEvent) => {
      if (drag.dragging || isTyping(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (event.key === "Escape") {
        if (picker || session || lineEdit) return;
        select(null);
      } else if (!selected) {
        if (event.key === "/") {
          event.preventDefault();
          openPickerAfterSelection();
        }
      } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        moveSelected(event.key === "ArrowUp" ? -1 : 1);
      } else if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSelected();
      } else if (event.key === "/") {
        event.preventDefault();
        openPickerAfterSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onCanvasClick = (event: React.MouseEvent) => {
    if (drag.dragging) return;
    const target = event.target as Element;
    if (target.closest("[data-ve-ui]")) return;
    const anchorElement = target.closest<HTMLElement>(".qd-sheets [data-edit-field]");
    const anchor = anchorElement ? readAnchor(anchorElement) : null;
    if (anchor && !readOnly && byId.has(anchor.blockId)) {
      select(anchor.blockId);
      openAnchor(anchor, { x: event.clientX, y: event.clientY });
      return;
    }
    const blockNode = target.closest<HTMLElement>(".qd-sheets [data-block-id]");
    const id = blockNode?.dataset.blockId;
    select(id && byId.has(id) ? id : null);
  };

  const onCanvasMove = (event: React.PointerEvent) => {
    if (drag.dragging) return;
    const target = event.target as Element;
    if (target.closest("[data-ve-ui]")) return;
    const node = target.closest<HTMLElement>(".qd-sheets [data-block-id]");
    let id = node?.dataset.blockId ?? null;
    let parent = node?.parentElement?.closest<HTMLElement>("[data-block-id]");
    while (parent) {
      id = parent.dataset.blockId ?? id;
      parent = parent.parentElement?.closest<HTMLElement>("[data-block-id]");
    }
    if (id !== hoverId) setHoverId(id);
  };

  const tab = (from: EditAnchor, backwards: boolean) => {
    const content = contentRef.current;
    if (!content) return;
    const seen = new Set<string>();
    const anchors: EditAnchor[] = [];
    for (const element of content.querySelectorAll<HTMLElement>('.qd-sheets [data-edit-kind="line"], .qd-sheets [data-edit-kind="multiline"]')) {
      const anchor = readAnchor(element);
      if (!anchor) continue;
      const key = `${anchor.blockId}|${anchor.field}`;
      if (seen.has(key)) continue;
      seen.add(key);
      anchors.push(anchor);
    }
    const at = anchors.findIndex((anchor) => anchor.blockId === from.blockId && anchor.field === from.field);
    const next = anchors[at + (backwards ? -1 : 1)];
    if (!next) {
      setSession(null);
      return;
    }
    select(next.blockId);
    scrollToBox(boxOf.get(next.blockId));
    openAnchor(next, null, true);
  };

  const sessionBlock = session ? byId.get(session.anchor.blockId) : undefined;
  const sessionValue = session && sessionBlock ? getField(sessionBlock, session.anchor.field) : undefined;
  const lineBlock = lineEdit ? byId.get(lineEdit.blockId) : undefined;
  const line = lineEdit && lineBlock && (lineBlock.type === "services" || lineBlock.type === "options") ? lineBlock.items.find((entry) => entry.id === lineEdit.lineId) : undefined;

  const totalLabel = totals.main.oneTime.totalCents > 0 ? "Totale una tantum" : "Totale";
  const showUi = !readOnly && !drag.dragging;
  const hoverBox = showUi && hoverId && hoverId !== selection ? boxOf.get(hoverId) : undefined;
  const outlineBlocks = drag.view ? drag.view.order.map((id) => byId.get(id)).filter((block): block is QuoteBlock => Boolean(block)) : document.blocks;
  const pageOf = new Map(geometry.blocks.map((box) => [box.id, box.page]));
  const groups = outlineGroups(outlineBlocks, pageOf, document.blocks.find((block) => block.type === "summary")?.id ?? null, drag.view?.id ?? null);

  return (
    <div ref={rootRef} className={cn("ve", readOnly && "is-readonly")} data-testid="editor-visuale">
      <Outline
        blocks={document.blocks}
        groups={groups}
        selectedId={selection}
        draggingId={drag.view?.id ?? null}
        readOnly={readOnly}
        totalLabel={totalLabel}
        totalValue={headlineTotal(totals)}
        fromServer={totalsFromServer}
        onSelect={(id) => {
          select(id);
          scrollToBox(boxOf.get(id));
        }}
        onToggle={toggleBlock}
        onAdd={openPickerAfterSelection}
      />
      <section className="ve-stage" aria-label="Foglio del preventivo">
        <div className="ve-bar">
          <p className="ve-hint muted small">
            {readOnly ? "Sola lettura: il foglio si può consultare ma non modificare." : selected ? `Blocco: ${blockLabel[selected.type]} · Alt+frecce per spostarlo, / per aggiungerne uno` : "Clicca un testo per scriverci sopra, trascina la maniglia per spostare un blocco"}
          </p>
          <div className="ve-zoom" role="group" aria-label="Zoom">
            <button type="button" className="icon-btn" aria-label="Riduci" disabled={zoom <= zoomSteps[0] + 0.001} onClick={() => setZoomChoice([...zoomSteps].reverse().find((step) => step < zoom - 0.001) ?? zoomSteps[0])}>
              <Minus size={14} aria-hidden="true" />
            </button>
            <span className="ve-zoom-value" aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <button type="button" className="icon-btn" aria-label="Ingrandisci" disabled={zoom >= zoomSteps[zoomSteps.length - 1] - 0.001} onClick={() => setZoomChoice(zoomSteps.find((step) => step > zoom + 0.001) ?? zoomSteps[zoomSteps.length - 1])}>
              <Plus size={14} aria-hidden="true" />
            </button>
            <button type="button" className={cn("ve-fit", zoomChoice === "fit" && "is-on")} aria-pressed={zoomChoice === "fit"} onClick={() => setZoomChoice("fit")} title="Adatta alla larghezza">
              <Maximize2 size={13} aria-hidden="true" /> Adatta
            </button>
          </div>
          <a className="btn btn-secondary btn-sm" href={`/api/quotes/${quoteId}/pdf`} target="_blank" rel="noopener" aria-disabled={unsaved || undefined} onClick={(event) => unsaved && event.preventDefault()} title={unsaved ? "Attendi il salvataggio automatico." : "Apre il PDF vero della bozza"}>
            <FileText size={14} aria-hidden="true" /> Vista PDF
          </a>
        </div>
        <div ref={scrollRef} className="ve-canvas">
          <div
            ref={(node) => {
              contentRef.current = node;
              setContentEl(node);
            }}
            className={cn("ve-content", !readOnly && "is-editable", drag.dragging && "is-dragging")}
            onClick={onCanvasClick}
            onPointerMove={onCanvasMove}
            onPointerLeave={() => setHoverId(null)}
          >
            {lineEdit ? <style>{`.ve-content [data-edit-block="${cssValue(lineEdit.blockId)}"][data-edit-field^="items.${cssValue(lineEdit.lineId)}."] { background: color-mix(in srgb, var(--cq-accent) 9%, transparent); box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--cq-accent) 55%, transparent); border-radius: 2px; }`}</style> : null}
            <QuoteDocumentView snapshot={snapshot} logoSrc={logoUrl} watermark="Bozza" layout="sheet" animate={false} kit={editKit} zoom={zoom} />

            <div className="ve-overlay">
              {hoverBox && hoverId ? (
                <div className="ve-hover" style={{ left: hoverBox.x - 6, top: hoverBox.y - 6, width: hoverBox.w + 12, height: hoverBox.h + 12 }}>
                  {byId.get(hoverId)?.type !== "cover" ? (
                    <button
                      type="button"
                      className="ve-handle"
                      data-ve-ui=""
                      aria-label={`Trascina ${blockTitle(byId.get(hoverId) as QuoteBlock)} per spostarlo`}
                      title="Trascina per spostare"
                      onPointerDown={(event) => drag.start(event, hoverId)}
                      onClick={() => select(hoverId)}
                    >
                      <GripVertical size={15} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              ) : null}

              {showUi && selected && selectedBox ? (
                <motion.div
                  className="ve-frame"
                  initial={false}
                  animate={{ left: selectedBox.x - 6, top: selectedBox.y - 6, width: selectedBox.w + 12, height: selectedBox.h + 12 }}
                  transition={reduced ? { duration: 0 } : SPRING}
                >
                  <span className="ve-frame-label">
                    {(() => {
                      const Icon = blockIcon[selected.type];
                      return <Icon size={12} aria-hidden="true" />;
                    })()}
                    {blockLabel[selected.type]}
                  </span>
                  {selected.type !== "cover" ? (
                    <button
                      type="button"
                      className="ve-handle"
                      data-ve-ui=""
                      aria-label={`Trascina ${blockTitle(selected)} per spostarlo`}
                      title="Trascina per spostare"
                      onPointerDown={(event) => drag.start(event, selected.id)}
                    >
                      <GripVertical size={15} aria-hidden="true" />
                    </button>
                  ) : null}
                  <motion.div
                    key={selected.id}
                    className="ve-toolbar"
                    role="toolbar"
                    aria-label={`Azioni su ${blockTitle(selected)}`}
                    data-ve-ui=""
                    initial={reduced ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.14, delay: reduced ? 0 : 0.04 }}
                  >
                    <ToolButton label="Sposta su" keys="Alt+↑" disabled={!allowed({ kind: "moveBlock", blockId: selected.id, toIndex: selectedIndex - 1 }) || selectedIndex === 0} onClick={() => moveSelected(-1)}>
                      <ArrowUp size={15} aria-hidden="true" />
                    </ToolButton>
                    <ToolButton label="Sposta giù" keys="Alt+↓" disabled={!allowed({ kind: "moveBlock", blockId: selected.id, toIndex: selectedIndex + 1 }) || selectedIndex === order.length - 1} onClick={() => moveSelected(1)}>
                      <ArrowDown size={15} aria-hidden="true" />
                    </ToolButton>
                    <span className="ve-toolbar-sep" aria-hidden="true" />
                    <ToolButton label="Duplica" keys="Ctrl+D" disabled={!allowed({ kind: "duplicateBlock", blockId: selected.id })} onClick={duplicateSelected}>
                      <Copy size={15} aria-hidden="true" />
                    </ToolButton>
                    <ToolButton label="Nascondi" disabled={readOnly} onClick={() => toggleBlock(selected.id)}>
                      <EyeOff size={15} aria-hidden="true" />
                    </ToolButton>
                    <ToolButton label="Tutti i campi" onClick={() => setFieldsOpen(true)} pressed={fieldsOpen}>
                      <SlidersHorizontal size={15} aria-hidden="true" />
                    </ToolButton>
                    <span className="ve-toolbar-sep" aria-hidden="true" />
                    <ToolButton label="Elimina" keys="Canc" danger disabled={!allowed({ kind: "removeBlock", blockId: selected.id })} onClick={removeSelected}>
                      <Trash2 size={15} aria-hidden="true" />
                    </ToolButton>
                  </motion.div>
                  {selected.type === "services" || selected.type === "options" ? (
                    <div className="ve-lines-bar" data-ve-ui="">
                      <button type="button" onClick={() => addLine(selected)}>
                        <Plus size={13} aria-hidden="true" /> Voce libera
                      </button>
                      <button type="button" onClick={() => setCatalogFor(selected.id)} disabled={items.length === 0} title={items.length === 0 ? "Il catalogo è vuoto." : undefined}>
                        <BookOpen size={13} aria-hidden="true" /> Dal catalogo
                      </button>
                    </div>
                  ) : null}
                </motion.div>
              ) : null}

              {showUi && !session && !picker
                ? zones.map((zone) => (
                    <div key={zone.key} className="ve-insert" data-ve-ui="" style={{ left: zone.x, top: zone.y - 9, width: zone.w }}>
                      <span className="ve-insert-line" aria-hidden="true" />
                      <button type="button" className="ve-insert-btn" onClick={() => openPicker(zone.index, zone.x + zone.w / 2, zone.y + 16, zone.where)}>
                        <Plus size={13} aria-hidden="true" /> Aggiungi blocco
                      </button>
                    </div>
                  ))
                : null}

              {drag.view ? (
                <>
                  <motion.div
                    className="ve-drop-slot"
                    initial={false}
                    animate={{ left: drag.view.region.x - 6, top: drag.view.region.y - 6, width: drag.view.region.w + 12, height: drag.view.region.h + 12 }}
                    transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 600, damping: 45 }}
                  >
                    <span className="ve-drop-line" />
                    <span className="ve-drop-label">{dropNumber ? `Diventa la sezione ${pad(dropNumber)}` : "Rilascia qui"}</span>
                  </motion.div>
                </>
              ) : null}

              {session && sessionBlock && typeof sessionValue === "string" && contentEl ? (
                <TextSession
                  key={session.key}
                  anchor={session.anchor}
                  initial={sessionValue}
                  limit={fieldLimit(sessionBlock, session.anchor.field)}
                  label={`${fieldName(session.anchor.field)}, ${blockTitle(sessionBlock)}`}
                  content={contentEl}
                  zoom={zoom}
                  point={session.point}
                  selectAll={session.selectAll}
                  onCommit={(value) => {
                    const result = run({ kind: "setField", blockId: session.anchor.blockId, field: session.anchor.field, value }, { order: "template", group: `field:${session.anchor.blockId}:${session.anchor.field}`, quiet: true });
                    return result.ok ? null : result.message;
                  }}
                  onClose={() => setSession((current) => (current?.key === session.key ? null : current))}
                  onTab={(backwards) => tab(session.anchor, backwards)}
                />
              ) : null}

              <AnimatePresence>
                {lineEdit && line && lineBlock && lineCellRect ? (
                  <LineCard
                    key={`${lineEdit.blockId}:${lineEdit.lineId}`}
                    line={line}
                    focus={lineEdit.focus}
                    position={{ x: Math.max(8, lineCellRect.x + lineCellRect.w - 340), y: lineCellRect.y + lineCellRect.h + 8 }}
                    taxProfile={snapshot.fiscal.taxProfile}
                    showQuantity={lineBlock.type === "services"}
                    onPatch={(patch) => patchLine(lineEdit, patch)}
                    onRemove={() => removeLine(lineEdit)}
                    onClose={() => setLineEdit(null)}
                  />
                ) : null}
              </AnimatePresence>

              {picker ? (
                <BlockPicker
                  position={{ x: picker.x, y: picker.y }}
                  present={new Set(document.blocks.map((block) => block.type))}
                  where={picker.where}
                  onPick={(type) => insertAt(type, picker.index)}
                  onClose={() => setPicker(null)}
                />
              ) : null}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {fieldsOpen && selected ? (
            <motion.aside
              key="fields"
              className="ve-fields"
              aria-label={`Campi di ${blockTitle(selected)}`}
              initial={reduced ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: 24 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="ve-fields-head">
                <div>
                  <h2>{blockTitle(selected)}</h2>
                  <p className="muted small">Tutti i campi del blocco {blockLabel[selected.type]}</p>
                </div>
                <button type="button" className="icon-btn" aria-label="Chiudi i campi" onClick={() => setFieldsOpen(false)}>
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="ve-fields-body">
                <BlockForm
                  key={selected.id}
                  block={selected}
                  onChange={(block) => exec({ kind: "replaceBlock", block }, `block:${block.id}`)}
                  ctx={{ quoteId, items, defaults, taxProfile: snapshot.fiscal.taxProfile, totals, readOnly }}
                />
              </div>
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </section>

      {drag.ghost ? <DragGhost ghost={drag.ghost} lifted={drag.lifted} x={drag.x} y={drag.y} reduced={reduced} /> : null}
      {drag.dragging ? (
        <div className="ve-drag-hint" role="status">
          Sposta su e giù tra le sezioni · la copertina resta in apertura <kbd>Esc</kbd>
        </div>
      ) : null}

      <CatalogPicker
        open={catalogFor !== null}
        items={items}
        onClose={() => setCatalogFor(null)}
        onLines={(lines) => {
          const block = catalogFor ? byId.get(catalogFor) : undefined;
          if (block && (block.type === "services" || block.type === "options")) exec({ kind: "replaceBlock", block: { ...block, items: [...block.items, ...lines] } });
          setCatalogFor(null);
        }}
      />
    </div>
  );
}

function ToolButton({
  label,
  keys,
  danger,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  keys?: string;
  danger?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={cn("ve-tool", danger && "is-danger")} aria-label={label} aria-pressed={pressed} title={keys ? `${label} (${keys})` : label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
