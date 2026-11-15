"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, BookOpen, Columns2, Columns3, Copy, Eye, EyeOff, FileText, GripVertical, Lock, LockOpen, Maximize2, Minus, PanelRightOpen, Plus, Search, SlidersHorizontal, TextCursorInput, Trash2, Unlink } from "lucide-react";
import { QuoteDocumentView } from "@/components/quote-render/quote-document";
import { editKit, readAnchor } from "@/components/quote-render/kit-edit";
import { buildModel, type Resources } from "@/components/quote-render/model";
import { renderers } from "@/components/quote-render/templates";
import { canColumn, columnTypes, layoutChoices, maxColumns, rowOf, spanLabel, unitsOf, type Span } from "@/domain/columns";
import { applyCommand, fieldLimit, getField, insertionIndex, lockedMessage, type DocumentCommand, type EditAnchor, type FieldPath } from "@/domain/document-ops";
import { blankLine, blockHint, blockLabel, starterBlock, type BlockType, type ChartBlockType, type QuoteBlock, type QuoteLine } from "@/domain/quote-document";
import { headlineParts, type QuoteSnapshot } from "@/domain/quote-snapshot";
import type { PriceMode } from "@/domain/pricing";
import type { QuotableItem } from "@/server/quotes";
import { cn } from "@/lib/cn";
import { BlockForm, CatalogPicker } from "../block-form";
import { ChartStyleFields } from "../chart-form";
import { isChartType } from "@/domain/charts";
import { blockIcon, blockTitle } from "../block-list";
import type { QuoteDraft } from "../state/use-quote-draft";
import { BlockPicker } from "./block-picker";
import { ContextMenu, type MenuEntry } from "./context-menu";
import { addableTypes, blockActions, hitTarget, type Gap, type MenuTarget } from "./menu-model";
import { SidePanel, type PanelTab } from "./side-panel";
import { DragGhost, useBlockDrag } from "./drag";
import { blockElement, cssValue, useGeometry, type BlockBox } from "./geometry";
import { RowDivider, type DividerRow } from "./row-divider";
import { LineCard, type LineFocus } from "./line-card";
import { Outline, blockTreeIcon, outlineGroups } from "./outline";
import { BlockStyle } from "./block-style";
import { FuseAction } from "@/components/ui/destructive";
import { HugeiconsIcon } from "@hugeicons/react";
import { TextSession, anchorSelector, type SessionApi } from "./text-session";
import { TextToolbar, type ToolbarBrand } from "../text/text-toolbar";
import { brandFontRef } from "@/components/quote-render/format";
import type { TextFormat } from "@/domain/text-format";
import { imagePlaceholder } from "../image-placeholder";

/**
 * Printed units for the insertion points: the boxes of the blocks, with the columns of a row merged
 * into the box around them. `unitEnd` maps the first column of a row to its last one. No cover.
 */
function unitBoxes(boxes: BlockBox[], blocks: QuoteBlock[]): { flow: BlockBox[]; unitEnd: Map<string, string> } {
  const rowKey = new Map<string, string>();
  for (const unit of unitsOf(blocks)) if (unit.kind === "row") for (const block of unit.blocks) rowKey.set(block.id, unit.row);
  const cover = new Set(blocks.filter((block) => block.type === "cover").map((block) => block.id));
  const unitEnd = new Map<string, string>();
  const flow: BlockBox[] = [];
  for (const box of boxes) {
    if (cover.has(box.id)) continue;
    const previous = flow[flow.length - 1];
    const row = rowKey.get(box.id);
    if (previous && row && rowKey.get(previous.id) === row && previous.page === box.page) {
      const x = Math.min(previous.x, box.x);
      const y = Math.min(previous.y, box.y);
      flow[flow.length - 1] = { ...previous, x, y, w: Math.max(previous.x + previous.w, box.x + box.w) - x, h: Math.max(previous.y + previous.h, box.y + box.h) - y };
      unitEnd.set(previous.id, box.id);
      continue;
    }
    flow.push(box);
  }
  return { flow, unitEnd };
}

const SHEET_PX = (595.28 * 96) / 72;
const zoomSteps = [0.5, 0.75, 0.9, 1, 1.25] as const;
const SPRING = { type: "spring" as const, stiffness: 500, damping: 40 };

type Session = { key: number; anchor: EditAnchor; point: { x: number; y: number } | null; selectAll: boolean };
type LineEdit = { blockId: string; lineId: string; focus: LineFocus };
type Picker = { index: number; x: number; y: number; where: string };
type Menu = { x: number; y: number; target: MenuTarget };

const PANEL_KEY = "cq.visuale.panel";
/** Below this width the panel starts closed, so the sheet keeps a readable size. */
const PANEL_AUTO_MIN = 1320;

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
  const resources: Resources = { logo: null, photo: () => null, image: () => "", watermark: null, versionLabel: null, placeholders: true };
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
  documentFields,
  documentStyle,
}: {
  draft: QuoteDraft;
  snapshot: QuoteSnapshot;
  logoUrl: string | null;
  readOnly: boolean;
  quoteId: string;
  items: QuotableItem[];
  defaults: { taxRateBp: number; priceMode: PriceMode };
  /** Client, validity and the other quote details, for the panel when nothing is selected. */
  documentFields: React.ReactNode;
  /** Template, cover photo and accent: the whole-document style controls. Gets a way to open Contenuto. */
  documentStyle: React.ReactNode | ((openContent: () => void) => React.ReactNode);
}) {
  const { document, run, totals, totalsFromServer, selection, setSelectedId, unsaved, lastStep } = draft;
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
  // The text last opened on the sheet: the Stile tab keeps styling it after the session closes.
  const [lastAnchor, setLastAnchor] = useState<EditAnchor | null>(null);
  if (session && (lastAnchor?.blockId !== session.anchor.blockId || lastAnchor.field !== session.anchor.field)) setLastAnchor(session.anchor);
  const sessionApi = useRef<SessionApi | null>(null);
  const [textRange, setTextRange] = useState<{ s: number; e: number } | null>(null);
  const [lineEdit, setLineEdit] = useState<LineEdit | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<PanelTab>("content");
  const [menu, setMenu] = useState<Menu | null>(null);
  const [veilDone, setVeilDone] = useState(0);
  const liveRef = useRef<HTMLDivElement>(null);
  const liveTimer = useRef(0);
  const [catalogFor, setCatalogFor] = useState<string | null>(null);
  const sessionKey = useRef(0);
  const pendingReveal = useRef<string | null>(null);
  const pendingAnchor = useRef<EditAnchor | null>(null);
  const revealOnly = useRef(false);
  // A block just added glows for a moment, so the eye finds it.
  const [fresh, setFresh] = useState<string | null>(null);
  const freshTimer = useRef(0);
  const flash = useCallback((id: string) => {
    window.clearTimeout(freshTimer.current);
    setFresh(id);
    freshTimer.current = window.setTimeout(() => setFresh(null), 1600);
  }, []);
  useEffect(() => () => window.clearTimeout(freshTimer.current), []);

  /** Screen reader announcements for what changed on the sheet (moves, inserts, deletes, undo). */
  const announce = useCallback((text: string) => {
    const node = liveRef.current;
    if (!node) return;
    window.clearTimeout(liveTimer.current);
    node.textContent = "";
    liveTimer.current = window.setTimeout(() => {
      node.textContent = text;
    }, 40);
  }, []);
  useEffect(() => () => window.clearTimeout(liveTimer.current), []);

  // The side panel: open by default on wide screens, then as the user left it.
  useLayoutEffect(() => {
    const stored = window.localStorage.getItem(PANEL_KEY);
    const wide = (rootRef.current?.clientWidth ?? 0) >= PANEL_AUTO_MIN;
    const apply = (open: boolean) => setPanelOpen(open);
    apply(stored === null ? wide : stored === "1");
  }, []);
  const showPanel = useCallback((open: boolean, tab?: PanelTab, remember = true) => {
    setPanelOpen(open);
    if (tab) setPanelTab(tab);
    if (remember) window.localStorage.setItem(PANEL_KEY, open ? "1" : "0");
  }, []);

  const byId = useMemo(() => new Map(document.blocks.map((block) => [block.id, block])), [document.blocks]);
  const order = useMemo(() => document.blocks.map((block) => block.id), [document.blocks]);
  const renderKey = useMemo(() => ({ snapshot, zoom }), [snapshot, zoom]);
  const { geometry, measure, pausedRef } = useGeometry(contentRef, order, renderKey);
  const boxOf = useMemo(() => new Map(geometry.blocks.map((box) => [box.id, box])), [geometry.blocks]);

  // The view fills the screen below the editor header; the sheet scrolls inside it. The app scrolls
  // inside <main class="page"> (under the topbar), so the offset includes that scroller's position.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const size = () => {
      const scroller = root.closest<HTMLElement>(".page");
      const top = root.getBoundingClientRect().top + (scroller ? scroller.scrollTop : window.scrollY);
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
      const only = revealOnly.current;
      revealOnly.current = false;
      const element = only ? null : blockElement(content, reveal);
      // A new block opens on its first printed text, selected, ready to be typed over.
      const first = element?.querySelector<HTMLElement>('[data-edit-kind="line"], [data-edit-kind="multiline"]');
      const field = first?.dataset.editField as FieldPath | undefined;
      if (only) {
        // A move from the outline: just bring the block into view.
      } else if (box && first && field) openAnchor({ blockId: reveal, field, kind: first.dataset.editKind === "multiline" ? "multiline" : "line" }, null, true);
      else showPanel(true, "content", false);
    }
    const anchor = pendingAnchor.current;
    if (anchor && content?.querySelector(anchorSelector(anchor))) {
      pendingAnchor.current = null;
      openAnchor(anchor, null, true);
    }
  }, [geometry.version, boxOf, openAnchor, scrollToBox, showPanel]);

  // When the zoom changes (the "Adatta" fit follows the panel opening or closing), the selection stays in view.
  const zoomSeen = useRef(zoom);
  useEffect(() => {
    if (zoomSeen.current === zoom) return;
    zoomSeen.current = zoom;
    const id = selection;
    const timer = window.setTimeout(() => {
      const scroll = scrollRef.current;
      const element = id ? blockElement(contentRef.current, id) : null;
      if (!scroll || !element) return;
      const rect = element.getBoundingClientRect();
      const view = scroll.getBoundingClientRect();
      if (rect.top < view.top || rect.top + Math.min(rect.height, view.height - 160) > view.bottom) scroll.scrollTo({ top: Math.max(0, scroll.scrollTop + rect.top - view.top - 96) });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [zoom, selection]);

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
    onSettled: (id) => {
      select(id);
      tellMoved(id);
    },
    canJoin: (id, targetId) => allowed({ kind: "joinRow", blockId: id, targetId, side: "after" }),
    onJoin: (id, targetId, side) => joinRow(id, targetId, side),
  });

  const canColumnId = (id: string | undefined) => {
    const block = id ? document.blocks.find((entry) => entry.id === id) : undefined;
    return Boolean(block && canColumn(block.type));
  };
  /** "Affianca a destra · 1/2 ciascuno", or "Prima colonna · diventano 3 da 1/3". */
  const joinLabel = (join: { targetId: string; side: "before" | "after" }) => {
    const row = rowOf(document.blocks, join.targetId);
    const count = (row?.blocks.filter((block) => block.id !== drag.view?.id).length ?? 1) + 1;
    const members = row?.blocks.filter((block) => block.id !== drag.view?.id) ?? [];
    const at = members.findIndex((block) => block.id === join.targetId) + (join.side === "after" ? 1 : 0);
    const place = count === 2 ? (join.side === "before" ? "Affianca a sinistra" : "Affianca a destra") : at === 0 ? "Prima colonna" : at === count - 1 ? "Ultima colonna" : "Colonna centrale";
    return `${place} · ${count === 2 ? "1/2 ciascuno" : `diventano ${count} da 1/${count}`}`;
  };
  const dropNumber = useMemo(() => (drag.view ? numberIn(snapshot, drag.view.order, drag.view.id) : 0), [drag.view, snapshot]);

  const selected = selection ? (byId.get(selection) ?? null) : null;
  const selectedBox = selected ? boxOf.get(selected.id) : undefined;
  const selectedRow = selected ? rowOf(document.blocks, selected.id) : null;
  const selectedCan = blockActions(document, selected?.id ?? "", readOnly);

  /** Reads the new position out loud; the latest document comes from the result, not from this render. */
  function tellMoved(id: string, blocks?: QuoteBlock[]) {
    const list = blocks ?? document.blocks;
    const at = list.findIndex((block) => block.id === id);
    const block = list[at];
    if (block) announce(`${blockTitle(block)} spostato: ora è il blocco ${at + 1} di ${list.length}`);
  }
  /** Up or down by one printed unit: a column takes its whole row along, a block hops over a whole row. */
  const moveBlock = (id: string, delta: -1 | 1) => {
    const result = exec({ kind: "moveUnit", blockId: id, delta });
    if (result.ok) tellMoved(id, result.value.blocks);
  };

  /**
   * "Sposta a pagina N": the pages come from the document order (cover, content, from the
   * Riepilogo), so a move is a reorder that lands the block at the end of the target page, or
   * right after the Riepilogo when the end is not allowed (e.g. the signature stays last).
   */
  const pageTargets = (id: string): Array<{ key: string; label: string; ids: string[] | null; current: boolean }> => {
    const block = byId.get(id);
    if (!block || block.type === "cover" || block.type === "summary" || rowOf(document.blocks, id)) return [];
    const groups = outlineGroups(document.blocks).filter((group) => group.key !== "cover" && group.label.startsWith("Pagina"));
    const without = document.blocks.filter((entry) => entry.id !== id).map((entry) => entry.id);
    return groups.map((group) => {
      const current = group.blocks.some((entry) => entry.id === id);
      let ids: string[] | null = null;
      if (!current) {
        const summaryAt = without.findIndex((entryId) => byId.get(entryId)?.type === "summary");
        const candidates: number[] =
          group.key === "content" ? [summaryAt < 0 ? without.length : summaryAt] : summaryAt < 0 ? [] : [without.length, summaryAt + 1];
        for (const at of candidates) {
          const next = [...without.slice(0, at), id, ...without.slice(at)];
          if (allowed({ kind: "reorderBlocks", ids: next })) {
            ids = next;
            break;
          }
        }
      }
      return { key: group.key, label: group.label, ids, current };
    });
  };
  const moveToPage = (id: string, key: string) => {
    const target = pageTargets(id).find((entry) => entry.key === key);
    if (!target?.ids) return;
    const result = exec({ kind: "reorderBlocks", ids: target.ids });
    if (!result.ok) return;
    tellMoved(id, result.value.blocks);
    announce(`${blockTitle(byId.get(id) as QuoteBlock)} spostato in ${target.label.split(" · ")[0]}`);
    select(id);
  };

  /** Side by side with an existing block (drag on its edge). */
  const joinRow = (id: string, targetId: string, side: "before" | "after") => {
    const result = exec({ kind: "joinRow", blockId: id, targetId, side });
    if (!result.ok) return false;
    const row = rowOf(result.value.blocks, id);
    const count = row?.blocks.length ?? 2;
    announce(`${blockTitle(byId.get(id) as QuoteBlock)} affiancato: riga di ${count} colonne`);
    select(id);
    return true;
  };
  /** A new block in a column next to an existing one. */
  const insertBeside = (type: BlockType, targetId: string, side: "before" | "after" = "after") => {
    const block = starterBlock(type, defaults);
    const result = exec({ kind: "insertBeside", block, targetId, side });
    if (!result.ok) return;
    select(block.id);
    flash(block.id);
    pendingReveal.current = block.id;
    announce(`Aggiunto accanto: ${blockLabel[type]}`);
  };
  /** A new row of text columns with a given layout, at an insertion point. */
  const insertRow = (spans: Span[], index: number) => {
    const blocks = spans.map(() => starterBlock("text", defaults));
    const result = exec({ kind: "insertRow", blocks, spans, index });
    setPicker(null);
    if (!result.ok || !blocks[0]) return;
    select(blocks[0].id);
    flash(blocks[0].id);
    pendingReveal.current = blocks[0].id;
    announce(`Aggiunta una riga a ${spans.length} colonne`);
  };
  const leaveRow = (id: string) => {
    const result = exec({ kind: "leaveRow", blockId: id });
    if (result.ok) announce(`${blockTitle(byId.get(id) as QuoteBlock)} tolto dalla riga: ora è a piena larghezza`);
  };
  const setRowLayout = (row: string, spans: Span[]) => {
    const result = exec({ kind: "setRowLayout", row, spans });
    if (result.ok) announce(`Larghezze: ${spans.map(spanLabel).join(" + ")}`);
  };
  const moveSelected = (delta: -1 | 1) => {
    if (selected) moveBlock(selected.id, delta);
  };
  const duplicateBlock = (id: string) => {
    const at = order.indexOf(id);
    const result = exec({ kind: "duplicateBlock", blockId: id });
    const copy = result.ok ? result.value.blocks[at + 1] : undefined;
    if (copy) {
      select(copy.id);
      flash(copy.id);
      pendingReveal.current = copy.id;
      announce(`Duplicato: ${blockTitle(copy)}`);
    }
  };
  const duplicateSelected = () => {
    if (selected) duplicateBlock(selected.id);
  };
  const removeBlock = (id: string) => {
    const block = byId.get(id);
    if (!block) return;
    const label = blockTitle(block);
    const at = order.indexOf(id);
    const result = exec({ kind: "removeBlock", blockId: id });
    if (!result.ok) return;
    if (selection === id) select(null);
    setSession(null);
    setLineEdit(null);
    // "Annulla" puts this very block back where it was, even after other edits; one toast at a time.
    const restore = () => {
      const back = run({ kind: "insertBlock", block, index: at }, { order: "template", quiet: true });
      if (back.ok) {
        select(block.id);
        revealOnly.current = true;
        pendingReveal.current = block.id;
      }
    };
    toast(`Blocco eliminato: ${label}`, { id: "block-removed", action: { label: "Annulla", onClick: restore }, duration: 6000 });
    announce(`Blocco eliminato: ${label}. Ctrl+Z per annullare.`);
  };
  const removeSelected = () => {
    if (selected) removeBlock(selected.id);
  };
  const toggleBlock = (id: string) => {
    const block = byId.get(id);
    const result = exec({ kind: "toggleBlock", blockId: id });
    if (result.ok && block) announce(block.visible ? `Nascosto nel documento: ${blockTitle(block)}` : `Di nuovo visibile: ${blockTitle(block)}`);
  };
  const lockBlock = (id: string, locked: boolean) => {
    const result = exec({ kind: "lockBlock", blockId: id, locked });
    if (!result.ok) return;
    if (locked) {
      if (session?.anchor.blockId === id) setSession(null);
      if (lineEdit?.blockId === id) setLineEdit(null);
    }
    const block = byId.get(id);
    toast(locked ? `Bloccato: ${block ? blockTitle(block) : "blocco"}. Il PDF non cambia.` : `Sbloccato: ${block ? blockTitle(block) : "blocco"}`, { duration: 2500 });
  };
  const tellLocked = (id: string) => {
    toast(lockedMessage, { id: "locked-block", action: { label: "Sblocca", onClick: () => lockBlock(id, false) }, duration: 4000 });
  };

  const insertAt = (type: BlockType, index: number) => {
    // Starter content, so the block prints at once and there is something to type over.
    const block = starterBlock(type, defaults);
    const result = exec({ kind: "insertBlock", block, index });
    setPicker(null);
    if (!result.ok) return;
    select(block.id);
    flash(block.id);
    pendingReveal.current = block.id;
    announce(`Aggiunto: ${blockLabel[type]}, blocco ${index + 1} di ${result.value.blocks.length}`);
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

  /**
   * Insertion points between the printed units; the cover keeps its page. The columns of a row
   * count as one unit, measured as the box around them: nothing goes in between two columns.
   */
  const { flow, unitEnd } = unitBoxes(geometry.blocks, document.blocks);
  const zones = flow.map((box, index) => {
    const previous = flow[index - 1];
    const y = previous && previous.page === box.page ? (previous.y + previous.h + box.y) / 2 : box.y - 12;
    const before = previous ? byId.get(unitEnd.get(previous.id) ?? previous.id) : document.blocks.find((block) => block.type === "cover");
    return { key: `before:${box.id}`, x: box.x, w: box.w, y, index: order.indexOf(box.id), where: before ? `Dopo «${blockTitle(before)}»` : "In apertura" };
  });
  const last = flow[flow.length - 1];
  if (last) {
    const lastId = unitEnd.get(last.id) ?? last.id;
    const block = byId.get(lastId);
    zones.push({ key: "end", x: last.x, w: last.w, y: last.y + last.h + 16, index: order.indexOf(lastId) + 1, where: block ? `Dopo «${blockTitle(block)}»` : "In fondo" });
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
    const index = insertionIndex(document, selected?.id ?? null);
    const after = index > 0 ? byId.get(order[index - 1] ?? "") : undefined;
    const box = (after ? boxOf.get(after.id) : undefined) ?? selectedBox ?? last;
    const where = after ? `Dopo «${blockTitle(after)}»` : "All'inizio";
    if (box) {
      scrollToBox(box);
      openPicker(index, box.x + box.w / 2, box.y + box.h + 18, where);
    } else {
      openPicker(index, 400, 40, where);
    }
  };

  /** "Modifica il testo": the block's first printed text, selected and ready to be typed over. */
  const editBlockText = (id: string) => {
    const block = byId.get(id);
    if (!block) return;
    select(id);
    if (block.locked) {
      tellLocked(id);
      return;
    }
    const first = blockElement(contentRef.current, id)?.querySelector<HTMLElement>('[data-edit-kind="line"], [data-edit-kind="multiline"]');
    const field = first?.dataset.editField as FieldPath | undefined;
    if (first && field) openAnchor({ blockId: id, field, kind: first.dataset.editKind === "multiline" ? "multiline" : "line" }, null, true);
    else openFields();
  };

  const openFields = () => {
    showPanel(true, "content");
    // The first field of the panel takes focus once it is on screen.
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>(".ve-panel-body input:not([type=hidden]), .ve-panel-body textarea, .ve-panel-body select")?.focus()),
    );
  };

  const between = (index: number) => {
    const before = document.blocks[index - 1];
    const after = document.blocks[index];
    if (before && after) return `Tra «${blockTitle(before)}» e «${blockTitle(after)}»`;
    if (before) return `Dopo «${blockTitle(before)}»`;
    return after ? `Prima di «${blockTitle(after)}»` : "In fondo";
  };

  const openMenu = (target: MenuTarget, x: number, y: number) => {
    setPicker(null);
    setLineEdit(null);
    setSession(null);
    if (target.kind === "block") select(target.id);
    setMenu({ x, y, target });
  };

  const onCanvasContextMenu = (event: React.MouseEvent) => {
    // Shift + right click, and right click while typing, keep the browser menu (spelling, copy, paste).
    if (readOnly || event.shiftKey || drag.dragging) return;
    const target = event.target as Element;
    if (target.closest(".ve-session, input, textarea, select, [contenteditable]")) return;
    if (target.closest("[data-ve-ui]")) {
      event.preventDefault();
      // The "+ Aggiungi blocco" line between two blocks is a place too.
      const key = target.closest<HTMLElement>("[data-zone]")?.dataset.zone;
      const gap = key ? zones.find((zone) => zone.key === key) : undefined;
      if (gap) openMenu({ kind: "gap", gap }, event.clientX, event.clientY);
      return;
    }
    const content = contentRef.current;
    if (!content) return;
    const origin = content.getBoundingClientRect();
    const hit = hitTarget({ x: event.clientX - origin.left, y: event.clientY - origin.top }, geometry.blocks, zones);
    if (!hit) return;
    event.preventDefault();
    openMenu(hit, event.clientX, event.clientY);
  };

  /** Menu key or Shift+F10: the menu of the selected block, or "add here" after the selection. */
  const openMenuFromKeyboard = () => {
    const content = contentRef.current;
    if (!content) return;
    const origin = content.getBoundingClientRect();
    if (selected && selectedBox) {
      scrollToBox(selectedBox);
      openMenu({ kind: "block", id: selected.id }, origin.left + selectedBox.x + Math.min(48, selectedBox.w / 2), origin.top + selectedBox.y + Math.min(32, selectedBox.h / 2));
      return;
    }
    const index = insertionIndex(document, null);
    const gap = zones.find((zone) => zone.index === index) ?? zones[zones.length - 1];
    if (!gap) return;
    openMenu({ kind: "gap", gap }, origin.left + gap.x + gap.w / 2 - 120, origin.top + gap.y);
  };

  const typeEntries = (index: number, prefix: string): MenuEntry[] => {
    const { content, charts, once } = addableTypes(document);
    const item = (entry: { type: BlockType; taken: boolean }): MenuEntry => ({
      kind: "item",
      id: `${prefix}:${entry.type}`,
      label: blockLabel[entry.type],
      icon: blockIcon[entry.type],
      hint: blockHint[entry.type],
      note: entry.taken ? "Già presente" : undefined,
      disabled: entry.taken || !allowed({ kind: "insertBlock", block: starterBlock(entry.type, defaults), index }),
    });
    return [
      { kind: "group", id: `${prefix}:content`, label: "Contenuti" },
      ...content.map(item),
      { kind: "group", id: `${prefix}:charts`, label: "Grafici" },
      ...charts.map(item),
      { kind: "group", id: `${prefix}:once`, label: "Una sola volta" },
      ...once.map(item),
    ];
  };
  const anyEnabled = (entries: MenuEntry[]) => entries.some((entry) => entry.kind === "item" && !entry.disabled);

  const menuEntries = (target: MenuTarget): MenuEntry[] => {
    if (target.kind === "gap") {
      const gap: Gap = target.gap;
      const types = typeEntries(gap.index, "here");
      const rows: MenuEntry[] = [
        { kind: "group", id: "row:g", label: "Colonne di testo, poi scegli il contenuto" },
        ...[[3, 3], [2, 4], [4, 2], [2, 2, 2]].map(
          (spans): MenuEntry => ({ kind: "item", id: `row:${spans.join("-")}`, label: spans.map(spanLabel).join(" + "), icon: spans.length === 3 ? Columns3 : Columns2, disabled: !allowed({ kind: "insertRow", blocks: spans.map(() => starterBlock("text", defaults)), spans, index: gap.index }) }),
        ),
      ];
      return [
        { kind: "submenu", id: "here", label: "Aggiungi un blocco", icon: Plus, disabled: !anyEnabled(types), entries: types },
        { kind: "submenu", id: "rows", label: "Aggiungi una riga a colonne", icon: Columns2, disabled: !anyEnabled(rows), entries: rows },
        {
          kind: "item",
          id: "search",
          label: "Cerca un blocco",
          icon: Search,
          keys: "/",
        },
      ];
    }
    const block = byId.get(target.id);
    if (!block) return [];
    const at = order.indexOf(block.id);
    const can = blockActions(document, block.id, readOnly);
    const above = can.insertBefore ? typeEntries(at, "above") : [];
    const below = typeEntries(at + 1, "below");
    const row = rowOf(document.blocks, block.id);
    const beside: MenuEntry[] = [
      { kind: "group", id: "beside:g", label: row ? `Nella riga, a destra (${row.blocks.length + 1} colonne)` : "Accanto, a destra (2 colonne)" },
      ...[...columnTypes].map(
        (type): MenuEntry => ({ kind: "item", id: `beside:${type}`, label: blockLabel[type], icon: blockIcon[type], hint: blockHint[type], disabled: !allowed({ kind: "insertBeside", block: starterBlock(type, defaults), targetId: block.id, side: "after" }) }),
      ),
    ];
    const layouts: MenuEntry[] = row
      ? layoutChoices(row.blocks.length).map((choice) => ({
          kind: "item",
          id: `layout:${choice.spans.join("-")}`,
          label: choice.label,
          icon: row.blocks.length === 3 ? Columns3 : Columns2,
          note: choice.spans.every((span, index) => row.blocks[index]?.col?.span === span) ? "Attuale" : undefined,
        }))
      : [];
    const columns: MenuEntry[] = [
      {
        kind: "submenu",
        id: "beside",
        label: "Affianca un blocco",
        icon: Columns2,
        disabled: !can.beside || !anyEnabled(beside),
        note: !canColumn(block.type) ? "Resta a piena larghezza" : row && row.blocks.length >= maxColumns ? "Riga piena" : undefined,
        entries: beside,
      },
      ...(row
        ? ([
            { kind: "submenu", id: "layout", label: "Larghezze della riga", icon: row.blocks.length === 3 ? Columns3 : Columns2, disabled: layouts.length < 2, entries: layouts },
            { kind: "item", id: "leave", label: "Togli dalla riga", icon: Unlink },
          ] as MenuEntry[])
        : []),
    ];
    return [
      { kind: "item", id: "edit", label: "Modifica il testo", icon: TextCursorInput, keys: "Invio", disabled: !can.edit },
      { kind: "submenu", id: "above", label: "Aggiungi sopra", icon: ArrowUpToLine, disabled: !anyEnabled(above), entries: above },
      { kind: "submenu", id: "below", label: "Aggiungi sotto", icon: ArrowDownToLine, disabled: !anyEnabled(below), entries: below },
      ...columns,
      { kind: "separator", id: "s1" },
      { kind: "item", id: "up", label: row ? "Sposta su la riga" : "Sposta su", icon: ArrowUp, keys: "Alt ↑", disabled: !can.moveUp },
      { kind: "item", id: "down", label: row ? "Sposta giù la riga" : "Sposta giù", icon: ArrowDown, keys: "Alt ↓", disabled: !can.moveDown },
      ...(() => {
        const pages = pageTargets(block.id);
        if (pages.length < 2) return [] as MenuEntry[];
        return [
          {
            kind: "submenu",
            id: "topage",
            label: "Sposta a pagina",
            icon: FileText,
            disabled: readOnly || !pages.some((page) => page.ids),
            entries: pages.map((page): MenuEntry => ({ kind: "item", id: `topage:${page.key}`, label: page.label, icon: FileText, disabled: !page.ids, note: page.current ? "Attuale" : page.ids ? undefined : "Non consentito dal template" })),
          },
        ] as MenuEntry[];
      })(),
      { kind: "item", id: "duplicate", label: "Duplica", icon: Copy, keys: "Ctrl D", disabled: !can.duplicate },
      { kind: "separator", id: "s2" },
      { kind: "item", id: "toggle", label: block.visible ? "Nascondi nel documento" : "Mostra nel documento", icon: block.visible ? EyeOff : Eye, disabled: !can.toggle },
      { kind: "item", id: "lock", label: block.locked ? "Sblocca il contenuto" : "Blocca il contenuto", icon: block.locked ? LockOpen : Lock, disabled: !can.lock },
      { kind: "item", id: "fields", label: "Tutti i campi", icon: SlidersHorizontal, keys: "F" },
      { kind: "separator", id: "s3" },
      { kind: "item", id: "remove", label: "Elimina", icon: Trash2, keys: "Canc", danger: true, disabled: !can.remove },
    ];
  };

  /** What a menu item does, by id: "above:text" inserts a Testo above, "remove" deletes, and so on. */
  const onMenuAction = (target: MenuTarget, action: string) => {
    const [where, type] = action.split(":") as [string, BlockType | undefined];
    if (target.kind === "gap") {
      const gap = target.gap;
      if (action === "search") openPicker(gap.index, gap.x + gap.w / 2, gap.y + 16, between(gap.index));
      else if (where === "here" && type) insertAt(type, gap.index);
      else if (where === "row" && type) insertRow(String(type).split("-").map(Number) as Span[], gap.index);
      return;
    }
    const id = target.id;
    const at = order.indexOf(id);
    if (type && (where === "above" || where === "below")) {
      // Above a row means above its first column, below it after the last one.
      const row = rowOf(document.blocks, id);
      insertAt(type, where === "above" ? (row ? row.start : at) : row ? row.start + row.blocks.length : at + 1);
      return;
    }
    if (type && where === "beside") {
      insertBeside(type, id);
      return;
    }
    if (type && where === "layout") {
      const row = rowOf(document.blocks, id);
      if (row) setRowLayout(row.row, String(type).split("-").map(Number) as Span[]);
      return;
    }
    if (action === "leave") {
      leaveRow(id);
      return;
    }
    if (where === "topage" && type) {
      moveToPage(id, String(type));
      return;
    }
    const block = byId.get(id);
    if (!block) return;
    if (action === "edit") editBlockText(id);
    else if (action === "up") moveBlock(id, -1);
    else if (action === "down") moveBlock(id, 1);
    else if (action === "duplicate") duplicateBlock(id);
    else if (action === "toggle") toggleBlock(id);
    else if (action === "lock") lockBlock(id, !block.locked);
    else if (action === "fields") openFields();
    else if (action === "remove") removeBlock(id);
  };

  // Shortcuts of the visual editor. Undo and redo are global (useUndoShortcuts).
  useEffect(() => {
    if (readOnly) return;
    const onKey = (event: KeyboardEvent) => {
      if (drag.dragging || menu || isTyping(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      const onSheet = event.target === window.document.body || (event.target instanceof Element && Boolean(event.target.closest(".ve-canvas")));
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        if (picker || session || lineEdit) return;
        event.preventDefault();
        openMenuFromKeyboard();
      } else if (event.key === "Escape") {
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
      } else if (event.key === "Enter" && onSheet && !mod && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        editBlockText(selected.id);
      } else if (event.key.toLowerCase() === "f" && onSheet && !mod && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        openFields();
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
      if (byId.get(anchor.blockId)?.locked) tellLocked(anchor.blockId);
      else openAnchor(anchor, { x: event.clientX, y: event.clientY });
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
      if (!anchor || byId.get(anchor.blockId)?.locked) continue;
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
  const toolbarBrand = useMemo<ToolbarBrand>(() => {
    const fonts: ToolbarBrand["fonts"] = [];
    const heading = brandFontRef(snapshot.brand.fontHeading);
    const body = brandFontRef(snapshot.brand.fontBody);
    if (heading) fonts.push({ ref: heading, role: "Titoli" });
    if (body && body !== heading) fonts.push({ ref: body, role: "Testo" });
    return {
      fonts,
      colors: [
        { color: snapshot.brand.colorPrimary, label: "Primario" },
        { color: snapshot.brand.colorSecondary, label: "Secondario" },
        { color: snapshot.brand.colorBackground, label: "Sfondo" },
      ].filter((item, index, list) => /^#[0-9A-F]{6}$/i.test(item.color) && list.findIndex((other) => other.color.toUpperCase() === item.color.toUpperCase()) === index),
    };
  }, [snapshot.brand]);
  const canvasBounds = useCallback(() => scrollRef.current?.getBoundingClientRect() ?? null, []);
  const sessionValue = session && sessionBlock ? getField(sessionBlock, session.anchor.field) : undefined;
  const lineBlock = lineEdit ? byId.get(lineEdit.blockId) : undefined;
  const line = lineEdit && lineBlock && (lineBlock.type === "services" || lineBlock.type === "options") ? lineBlock.items.find((entry) => entry.id === lineEdit.lineId) : undefined;

  const closeMenu = useCallback(() => setMenu(null), []);
  // The menu belongs to one place on the sheet: zooming moves it, so it closes.
  useEffect(() => closeMenu, [zoom, closeMenu]);

  // Undo and redo: a violet veil over what changed, and a word for screen readers.
  useEffect(() => {
    if (!lastStep) return;
    announce(lastStep.direction === "undo" ? "Modifica annullata" : "Modifica ripristinata");
    const timer = window.setTimeout(() => setVeilDone(lastStep.n), 700);
    return () => window.clearTimeout(timer);
  }, [lastStep, announce]);

  const totalLabel = totals.main.oneTime.totalCents > 0 ? "Totale una tantum" : "Totale";
  const showUi = !readOnly && !drag.dragging;
  const lockedIds = document.blocks.filter((block) => block.locked).map((block) => block.id);
  const hoverBox = showUi && hoverId && hoverId !== selection ? boxOf.get(hoverId) : undefined;
  // The width divider shows on the row being worked on: the selected one, else the one under the pointer.
  const dividerRow = ((): DividerRow | null => {
    if (!showUi || session) return null;
    const row = selectedRow ?? (hoverId ? rowOf(document.blocks, hoverId) : null);
    const [a, b] = row?.blocks ?? [];
    if (!row || row.blocks.length !== 2 || !a?.col || !b) return null;
    const left = boxOf.get(a.id);
    const right = boxOf.get(b.id);
    if (!left || !right || left.page !== right.page) return null;
    return { row: row.row, left, right, first: a.col.span, label: `${blockTitle(a)} e ${blockTitle(b)}` };
  })();
  const outlineBlocks = drag.view ? drag.view.order.map((id) => byId.get(id)).filter((block): block is QuoteBlock => Boolean(block)) : document.blocks;

  return (
    <div ref={rootRef} className={cn("ve", readOnly && "is-readonly", panelOpen && "has-panel")} data-testid="editor-visuale">
      <Outline
        blocks={outlineBlocks}
        selectedId={selection}
        draggingId={drag.view?.id ?? null}
        readOnly={readOnly}
        totalLabel={totalLabel}
        total={headlineParts(totals)}
        fromServer={totalsFromServer}
        onSelect={(id) => {
          select(id);
          scrollToBox(boxOf.get(id));
        }}
        onToggle={toggleBlock}
        onLock={lockBlock}
        onRemove={removeBlock}
        onMove={moveBlock}
        onMenu={(id, x, y) => openMenu({ kind: "block", id }, x, y)}
        onReorder={(ids, movedId) => {
          const result = exec({ kind: "reorderBlocks", ids });
          if (!result.ok) return false;
          tellMoved(movedId, result.value.blocks);
          select(movedId);
          pendingReveal.current = movedId;
          revealOnly.current = true;
          return true;
        }}
        onAdd={openPickerAfterSelection}
      />
      <section className="ve-stage" aria-label="Foglio del preventivo">
        <div className="ve-bar">
          <p className="ve-hint muted small">
            {readOnly ? "Sola lettura: il foglio si può consultare ma non modificare." : selected ? `Blocco: ${blockLabel[selected.type]} · tasto destro per le azioni, Alt+frecce per spostarlo` : "Clicca un testo per scriverci sopra, tasto destro per aggiungere un blocco in quel punto"}
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
          {!panelOpen ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => showPanel(true)} aria-label="Apri il pannello delle proprietà" title="Apri il pannello (campi e stile)">
              <PanelRightOpen size={14} aria-hidden="true" /> Pannello
            </button>
          ) : null}
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
            onContextMenu={onCanvasContextMenu}
            onPointerMove={onCanvasMove}
            onPointerLeave={() => setHoverId(null)}
          >
            {lockedIds.length ? <style>{`${lockedIds.map((id) => `.ve-content .qd-sheets [data-edit-block="${cssValue(id)}"]`).join(", ")} { cursor: default !important; box-shadow: none !important; background-color: transparent !important; }`}</style> : null}
            {lineEdit ? <style>{`.ve-content [data-edit-block="${cssValue(lineEdit.blockId)}"][data-edit-field^="items.${cssValue(lineEdit.lineId)}."] { background: color-mix(in srgb, var(--cq-accent) 9%, transparent); box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--cq-accent) 55%, transparent); border-radius: 2px; }`}</style> : null}
            <QuoteDocumentView snapshot={snapshot} logoSrc={logoUrl} watermark="Bozza" layout="sheet" animate={false} kit={editKit} zoom={zoom} imagePlaceholder={imagePlaceholder} />

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
                  className={cn("ve-frame", fresh === selected.id && "is-new", selected.locked && "is-locked")}
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
                    {selected.col && selectedRow ? <span className="ve-frame-col">{`Colonna ${spanLabel(selected.col.span)}`}</span> : null}
                    {session && session.anchor.blockId === selected.id ? <span className="ve-frame-field">{fieldName(session.anchor.field)}</span> : null}
                    {selected.locked ? (
                      <>
                        <Lock size={11} aria-hidden="true" /> Bloccato
                      </>
                    ) : null}
                  </span>
                  {(["tl", "tr", "bl", "br"] as const).map((corner) => (
                    <span key={corner} className="ve-frame-corner" data-c={corner} aria-hidden="true" />
                  ))}
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
                    className={cn("ve-toolbar", selectedRow && selectedRow.blocks.at(-1)?.id !== selected.id && "is-start")}
                    role="toolbar"
                    aria-label={`Azioni su ${blockTitle(selected)}`}
                    data-ve-ui=""
                    initial={reduced ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.14, delay: reduced ? 0 : 0.04 }}
                  >
                    <ToolButton label={selectedRow ? "Sposta su la riga" : "Sposta su"} keys="Alt+↑" disabled={!selectedCan.moveUp} onClick={() => moveSelected(-1)}>
                      <ArrowUp size={15} aria-hidden="true" />
                    </ToolButton>
                    <ToolButton label={selectedRow ? "Sposta giù la riga" : "Sposta giù"} keys="Alt+↓" disabled={!selectedCan.moveDown} onClick={() => moveSelected(1)}>
                      <ArrowDown size={15} aria-hidden="true" />
                    </ToolButton>
                    <span className="ve-toolbar-sep" aria-hidden="true" />
                    <ToolButton label="Duplica" keys="Ctrl+D" disabled={!allowed({ kind: "duplicateBlock", blockId: selected.id })} onClick={duplicateSelected}>
                      <Copy size={15} aria-hidden="true" />
                    </ToolButton>
                    <ToolButton label="Nascondi" disabled={readOnly} onClick={() => toggleBlock(selected.id)}>
                      <EyeOff size={15} aria-hidden="true" />
                    </ToolButton>
                    <ToolButton label={selected.locked ? "Sblocca il contenuto" : "Blocca il contenuto"} pressed={Boolean(selected.locked)} onClick={() => lockBlock(selected.id, !selected.locked)}>
                      {selected.locked ? <Lock size={15} aria-hidden="true" /> : <LockOpen size={15} aria-hidden="true" />}
                    </ToolButton>
                    <ToolButton label="Tutti i campi" keys="F" onClick={openFields} pressed={panelOpen && panelTab === "content"}>
                      <SlidersHorizontal size={15} aria-hidden="true" />
                    </ToolButton>
                    {selectedRow ? (
                      <>
                        <span className="ve-toolbar-sep" aria-hidden="true" />
                        {layoutChoices(selectedRow.blocks.length).length > 1 ? (
                        <span className="ve-widths" role="group" aria-label="Larghezze della riga">
                          {layoutChoices(selectedRow.blocks.length).map((choice) => {
                            const on = choice.spans.every((span, index) => selectedRow.blocks[index]?.col?.span === span);
                            return (
                              <button key={choice.label} type="button" className={cn("ve-width", on && "is-on")} aria-pressed={on} aria-label={`Larghezze ${choice.label}`} title={`Larghezze ${choice.label}`} disabled={readOnly} onClick={() => setRowLayout(selectedRow.row, choice.spans)}>
                                <span className="ve-width-glyph" aria-hidden="true">
                                  {choice.spans.map((span, index) => (
                                    <i key={index} style={{ flexGrow: span }} />
                                  ))}
                                </span>
                              </button>
                            );
                          })}
                        </span>
                        ) : null}
                        <ToolButton label="Togli dalla riga" disabled={readOnly} onClick={() => leaveRow(selected.id)}>
                          <Unlink size={15} aria-hidden="true" />
                        </ToolButton>
                      </>
                    ) : null}
                    <span className="ve-toolbar-sep" aria-hidden="true" />
                    <ToolButton label="Elimina" keys="Canc" danger disabled={!allowed({ kind: "removeBlock", blockId: selected.id })} onClick={removeSelected}>
                      <Trash2 size={15} aria-hidden="true" />
                    </ToolButton>
                  </motion.div>
                  {(selected.type === "services" || selected.type === "options") && !selected.locked ? (
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

              {dividerRow ? (
                <RowDivider
                  key={dividerRow.row}
                  row={dividerRow}
                  onChange={(spans, group) => exec({ kind: "setRowLayout", row: dividerRow.row, spans }, group)}
                  onDone={(spans) => announce(`Larghezze: ${spans.map(spanLabel).join(" + ")}`)}
                />
              ) : null}

              {showUi && !session && !picker && !menu
                ? zones.map((zone) => (
                    <div key={zone.key} className="ve-insert" data-ve-ui="" data-zone={zone.key} style={{ left: zone.x, top: zone.y - 9, width: zone.w }}>
                      <span className="ve-insert-line" aria-hidden="true" />
                      <button type="button" className="ve-insert-btn" onClick={() => openPicker(zone.index, zone.x + zone.w / 2, zone.y + 16, zone.where)}>
                        <Plus size={13} aria-hidden="true" /> Aggiungi blocco
                      </button>
                    </div>
                  ))
                : null}

              {drag.view?.join ? (
                <div className="ve-join" style={{ left: drag.view.region.x, top: drag.view.region.y - 6, height: drag.view.region.h + 12 }} aria-hidden="true">
                  <span className="ve-join-line" />
                  <span className={cn("ve-join-label", drag.view.join.side === "before" ? "is-before" : "is-after")}>{joinLabel(drag.view.join)}</span>
                </div>
              ) : drag.view ? (
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
                  initialMarks={sessionBlock.fmt?.[session.anchor.field]?.marks ?? []}
                  api={sessionApi}
                  onSelection={setTextRange}
                  limit={fieldLimit(sessionBlock, session.anchor.field)}
                  label={`${fieldName(session.anchor.field)}, ${blockTitle(sessionBlock)}`}
                  content={contentEl}
                  zoom={zoom}
                  point={session.point}
                  selectAll={session.selectAll}
                  onCommit={(value, marks) => {
                    const result = run({ kind: "setRich", blockId: session.anchor.blockId, field: session.anchor.field, value, marks }, { order: "template", group: `field:${session.anchor.blockId}:${session.anchor.field}`, quiet: true });
                    return result.ok ? null : result.message;
                  }}
                  onClose={() => {
                    setTextRange(null);
                    setSession((current) => (current?.key === session.key ? null : current));
                  }}
                  onTab={(backwards) => tab(session.anchor, backwards)}
                />
              ) : null}
              <AnimatePresence>
                {session && sessionBlock && typeof sessionValue === "string" && contentEl && !readOnly ? (
                  <TextToolbar
                    key={`tt:${session.key}`}
                    api={sessionApi}
                    selection={textRange}
                    format={sessionBlock.fmt?.[session.anchor.field]}
                    multiline={session.anchor.kind === "multiline"}
                    label={`${fieldName(session.anchor.field)} · ${blockTitle(sessionBlock)}`}
                    brand={toolbarBrand}
                    bounds={canvasBounds}
                    onFormat={(patch, live) => {
                      const current: TextFormat = sessionBlock.fmt?.[session.anchor.field] ?? {};
                      const next = { ...current, ...patch } as TextFormat;
                      for (const key of Object.keys(next) as Array<keyof TextFormat>) if (next[key] === undefined) delete next[key];
                      run({ kind: "setFormat", blockId: session.anchor.blockId, field: session.anchor.field, format: next }, { order: "template", group: live ? `fmt:${session.anchor.blockId}:${session.anchor.field}:${Object.keys(patch).join()}` : undefined });
                    }}
                    onClear={() => {
                      run({ kind: "setFormat", blockId: session.anchor.blockId, field: session.anchor.field, format: null }, { order: "template" });
                      const api = sessionApi.current;
                      if (api) api.mark(Object.fromEntries(["b", "i", "u", "x", "c", "h", "f", "z", "href"].map((key) => [key, undefined])), { s: 0, e: api.text().length });
                    }}
                  />
                ) : null}
              </AnimatePresence>

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

              {menu?.target.kind === "gap" ? (
                <div className="ve-insert is-here" style={{ left: menu.target.gap.x, top: menu.target.gap.y - 9, width: menu.target.gap.w }} aria-hidden="true">
                  <span className="ve-insert-line" />
                  <span className="ve-insert-here">Inserisci qui</span>
                </div>
              ) : null}

              {lastStep && lastStep.n !== veilDone
                ? lastStep.changed.map((id) => {
                    const box = boxOf.get(id);
                    return box ? (
                      <motion.div
                        key={`${lastStep.n}:${id}`}
                        className="ve-veil"
                        aria-hidden="true"
                        style={{ left: box.x - 6, top: box.y - 6, width: box.w + 12, height: box.h + 12 }}
                        initial={{ opacity: reduced ? 1 : 0.95 }}
                        animate={{ opacity: reduced ? 1 : 0 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                      />
                    ) : null;
                  })
                : null}

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

      </section>

      {panelOpen ? (
        <SidePanel
          tab={panelTab}
          onTab={setPanelTab}
          onClose={() => showPanel(false)}
          reduced={reduced}
          contextKey={selected?.id ?? "document"}
          title={selected ? blockTitle(selected) : "Documento"}
          icon={<HugeiconsIcon icon={selected ? blockTreeIcon[selected.type] : blockTreeIcon.cover} size={18} strokeWidth={1.8} />}
          crumbs={
            selected
              ? [
                  outlineGroups(document.blocks).find((group) => group.blocks.some((block) => block.id === selected.id))?.label.split(" · ")[0] ?? "Documento",
                  blockLabel[selected.type],
                  ...(session && session.anchor.blockId === selected.id ? [fieldName(session.anchor.field)] : []),
                ]
              : ["Tutto il documento"]
          }
          subtitle={
            selected
              ? selected.locked
                ? "Contenuto bloccato: sbloccalo per modificarlo."
                : panelTab === "content"
                  ? `I campi di questo blocco${selected.visible ? "" : " · nascosto nel documento"}`
                  : "Lo stile di questo blocco: testi, spazi, sfondo e bordi."
              : panelTab === "content"
                ? "Cliente, validità e dettagli. Clicca un blocco sul foglio per i suoi campi."
                : "Colore, foto e tipografia di tutte le pagine."
          }
          content={
            selected ? (
              <BlockForm
                key={selected.id}
                part="content"
                block={selected}
                onChange={(block) => exec({ kind: "replaceBlock", block }, `block:${block.id}`)}
                ctx={{ quoteId, items, defaults, taxProfile: snapshot.fiscal.taxProfile, totals, readOnly: readOnly || Boolean(selected.locked) }}
              />
            ) : (
              documentFields
            )
          }
          style={
            <>
              {selected ? (
                <BlockStyle
                  key={selected.id}
                  block={selected}
                  focusField={session && session.anchor.blockId === selected.id ? session.anchor.field : null}
                  recentField={lastAnchor && lastAnchor.blockId === selected.id ? lastAnchor.field : null}
                  fieldName={fieldName}
                  readOnly={readOnly}
                  brandColors={toolbarBrand.colors.map((item) => item.color)}
                  brandFonts={toolbarBrand.fonts}
                  widthLabel={selected.col ? `colonna ${spanLabel(selected.col.span)}` : "tutta la pagina"}
                  onFormat={(field, format, live) => exec({ kind: "setFormat", blockId: selected.id, field, format }, live ? `fmt:${selected.id}:${field}` : undefined)}
                  onLook={(look, live) => exec({ kind: "setLook", blockId: selected.id, look }, live ? `look:${selected.id}` : undefined)}
                  onReset={() => {
                    exec({ kind: "resetBlockStyle", blockId: selected.id });
                    announce(`Stile di ${blockTitle(selected)} riportato al template`);
                  }}
                />
              ) : null}
              {selected ? (
                <section className="ve-panel-section" aria-labelledby="ve-block-style">
                  <h3 id="ve-block-style">Visibilità</h3>
                  <label className="ve-switch">
                    <input type="checkbox" role="switch" checked={selected.visible} disabled={readOnly} onChange={() => toggleBlock(selected.id)} />
                    <span className="ve-switch-track" aria-hidden="true" />
                    <span>
                      Visibile nel documento
                      <small className="muted">{selected.visible ? "Compare nel foglio, nella pagina pubblica e nel PDF." : "Nascosto: resta nella bozza ma non si stampa."}</small>
                    </span>
                  </label>
                  <label className="ve-switch">
                    <input type="checkbox" role="switch" checked={Boolean(selected.locked)} disabled={readOnly} onChange={() => lockBlock(selected.id, !selected.locked)} />
                    <span className="ve-switch-track" aria-hidden="true" />
                    <span>
                      Contenuto bloccato
                      <small className="muted">Protegge i testi da modifiche per sbaglio. Il PDF non cambia.</small>
                    </span>
                  </label>
                  {selected.type === "cover" ? <p className="muted small">La foto della copertina si sceglie in Documento: clicca fuori dal foglio, poi Stile.</p> : null}
                  {allowed({ kind: "removeBlock", blockId: selected.id }) ? (
                    <div className="ve-panel-danger">
                      <FuseAction key={selected.id} kind="delete" label="Elimina blocco" onCommit={() => removeBlock(selected.id)} />
                      <small className="muted">Hai qualche secondo per annullare, poi resta Ctrl+Z.</small>
                    </div>
                  ) : null}
                </section>
              ) : null}
              {selected && isChartType(selected.type) ? (
                <section className="ve-panel-section" aria-labelledby="ve-chart-style">
                  <h3 id="ve-chart-style">Grafico</h3>
                  <fieldset className="block-form" disabled={readOnly || Boolean(selected.locked)}>
                    <legend className="visually-hidden">Aspetto del grafico</legend>
                    <ChartStyleFields block={selected as Extract<QuoteBlock, { type: ChartBlockType }>} onChange={(block) => exec({ kind: "replaceBlock", block }, `block:${block.id}`)} />
                  </fieldset>
                </section>
              ) : null}
              {selected ? null : typeof documentStyle === "function" ? documentStyle(() => setPanelTab("content")) : documentStyle}
            </>
          }
        />
      ) : null}

      <div ref={liveRef} className="visually-hidden" role="status" aria-live="polite" aria-atomic="true" data-testid="ve-live" />

      {menu ? (
        <ContextMenu
          point={{ x: menu.x, y: menu.y }}
          label={menu.target.kind === "block" ? `Azioni su ${blockTitle(byId.get(menu.target.id) as QuoteBlock)}` : "Aggiungi qui"}
          entries={menuEntries(menu.target)}
          head={<MenuHead target={menu.target} byId={byId} between={between} />}
          foot={<p className="ve-menu-foot">Maiusc + clic destro: menu del browser</p>}
          onAction={(action) => onMenuAction(menu.target, action)}
          onClose={closeMenu}
        />
      ) : null}

      {drag.ghost ? <DragGhost ghost={drag.ghost} lifted={drag.lifted} x={drag.x} y={drag.y} reduced={reduced} /> : null}
      {drag.dragging ? (
        <div className="ve-drag-hint" role="status">
          {drag.view?.join
            ? "Rilascia per affiancare: le colonne si dividono la larghezza"
            : canColumnId(drag.view?.id)
              ? "Sposta su e giù · sul bordo di un blocco per affiancarlo"
              : "Sposta su e giù tra le sezioni · la copertina resta in apertura"}{" "}
          <kbd>Esc</kbd>
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

function MenuHead({ target, byId, between }: { target: MenuTarget; byId: Map<string, QuoteBlock>; between: (index: number) => string }) {
  if (target.kind === "gap") {
    return (
      <div className="ve-menu-head">
        <span className="ve-menu-head-icon is-here" aria-hidden="true">
          <Plus size={14} />
        </span>
        <span>
          <strong>Qui</strong>
          <small>{between(target.gap.index)}</small>
        </span>
      </div>
    );
  }
  const block = byId.get(target.id);
  if (!block) return null;
  const Icon = blockIcon[block.type];
  return (
    <div className="ve-menu-head">
      <span className="ve-menu-head-icon" aria-hidden="true">
        <Icon size={14} />
      </span>
      <span>
        <strong>{blockTitle(block)}</strong>
        <small>
          {blockLabel[block.type]}
          {block.locked ? " · bloccato" : ""}
          {block.visible ? "" : " · nascosto"}
        </small>
      </span>
    </div>
  );
}
