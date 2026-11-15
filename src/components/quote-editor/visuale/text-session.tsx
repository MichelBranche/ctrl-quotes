"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { EditAnchor } from "@/domain/document-ops";
import { applyMark, normalizeMarks, remapMarks, type Mark, type MarkAttrs } from "@/domain/text-format";
import { cssValue, relativeRect } from "./geometry";
import { readRich, renderRich, restoreSelection, selectionOffsets } from "./rich-dom";

/** What the floating text toolbar can do with the open session. */
export type SessionApi = {
  box: () => HTMLElement | null;
  field: () => HTMLElement | null;
  /** Last selection inside the field (kept while the toolbar has focus). */
  selection: () => { s: number; e: number } | null;
  text: () => string;
  marks: () => Mark[];
  /** Sets or clears mark attributes on the selection (or on `range`). */
  mark: (patch: Partial<MarkAttrs>, range?: { s: number; e: number }) => void;
  /** Bullet or numbered list on the selected lines (all lines without a selection). */
  list: (kind: "bullet" | "number") => void;
  focus: () => void;
};

const bullet = /^(•|\d{1,2}\.) /;

/** Typing is sent to the document after this pause; undo groups a field within 800 ms anyway. */
const COMMIT_MS = 120;

const copied = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "textTransform",
  "textAlign",
  "color",
  "fontVariantNumeric",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
] as const;

export function anchorSelector(anchor: Pick<EditAnchor, "blockId" | "field">) {
  return `[data-edit-block="${cssValue(anchor.blockId)}"][data-edit-field="${cssValue(anchor.field)}"]`;
}

/** The element whose text the session copies: itself, or the longest paragraph of a region. */
function typeSource(element: HTMLElement): HTMLElement {
  if (element.classList.contains("k-t")) return element;
  let best: HTMLElement | null = null;
  for (const text of element.querySelectorAll<HTMLElement>(".k-t")) {
    if (!best || (text.textContent?.length ?? 0) > (best.textContent?.length ?? 0)) best = text;
  }
  return best ?? element;
}

function nearestTo(elements: HTMLElement[], point: { x: number; y: number }): number {
  let best = 0;
  let distance = Infinity;
  elements.forEach((element, index) => {
    const rect = element.getBoundingClientRect();
    const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
    const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
    const next = dx * dx + dy * dy;
    if (next < distance) {
      distance = next;
      best = index;
    }
  });
  return best;
}

function placeCaret(element: HTMLElement, point: { x: number; y: number } | null, selectAll: boolean) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  if (point && !selectAll) {
    const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null; caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
    const position = doc.caretPositionFromPoint?.(point.x, point.y);
    const fromPoint = position ? null : doc.caretRangeFromPoint?.(point.x, point.y);
    const node = position?.offsetNode ?? fromPoint?.startContainer;
    const offset = position?.offset ?? fromPoint?.startOffset ?? 0;
    if (node && element.contains(node)) {
      range.setStart(node, offset);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
  }
  range.selectNodeContents(element);
  if (!selectAll) range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Writing on the sheet. A plain text field is laid exactly over the printed text, with the same
 * font, size, spacing and width, while the printed text underneath turns transparent. React never
 * touches what you type (the field is uncontrolled), so the caret never jumps; the document gets
 * the value after a short pause and the template re-renders underneath.
 */
export function TextSession({
  anchor,
  initial,
  initialMarks = [],
  api: apiRef,
  onSelection,
  limit,
  label,
  content,
  zoom,
  point,
  selectAll,
  onCommit,
  onClose,
  onTab,
}: {
  anchor: EditAnchor;
  initial: string;
  initialMarks?: Mark[];
  /** Filled with the session controls for the text toolbar. */
  api?: RefObject<SessionApi | null>;
  /** The selection inside the field changed (the toolbar shows its formatting). */
  onSelection?: (range: { s: number; e: number } | null) => void;
  limit: number | null;
  label: string;
  content: HTMLElement;
  zoom: number;
  point: { x: number; y: number } | null;
  selectAll: boolean;
  /** Returns an error message when the value is refused. */
  onCommit: (value: string, marks: Mark[]) => string | null;
  onClose: () => void;
  onTab: (backwards: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initialKey] = useState(() => `${initial}\u0000${JSON.stringify(normalizeMarks(initialMarks, initial.length))}`);
  const last = useRef(initialKey);
  const saved = useRef<{ s: number; e: number } | null>(null);
  const closed = useRef(false);
  const composing = useRef(false);
  const occurrence = useRef<number | null>(null);
  const [length, setLength] = useState(initial.length);
  const [error, setError] = useState<string | null>(null);
  const multiline = anchor.kind === "multiline";

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const node = field.current;
    if (!node) return;
    const { text: value, marks } = readRich(node, multiline);
    const key = `${value}\u0000${JSON.stringify(marks)}`;
    if (key === last.current) return;
    const problem = onCommit(value, marks);
    setError(problem);
    if (!problem) last.current = key;
  };

  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, COMMIT_MS);
  };

  /** Rewrites the field from text and marks, keeps the selection, commits right away. */
  const rewrite = (text: string, marks: Mark[], range: { s: number; e: number } | null) => {
    const node = field.current;
    if (!node) return;
    renderRich(node, text, marks, multiline);
    setLength(text.length);
    if (range) {
      node.focus({ preventScroll: true });
      restoreSelection(node, Math.min(range.s, text.length), Math.min(range.e, text.length));
    }
    flush();
  };

  useLayoutEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      box: () => box.current,
      field: () => field.current,
      selection: () => saved.current,
      text: () => (field.current ? readRich(field.current, multiline).text : initial),
      marks: () => (field.current ? readRich(field.current, multiline).marks : []),
      focus: () => field.current?.focus({ preventScroll: true }),
      mark: (patch, range) => {
        const node = field.current;
        if (!node) return;
        const { text, marks } = readRich(node, multiline);
        const target = range ?? saved.current;
        if (!target || target.e <= target.s) return;
        rewrite(text, applyMark(marks, text.length, target.s, target.e, patch), target);
      },
      list: (kind) => {
        const node = field.current;
        if (!node || !multiline) return;
        let { text, marks } = readRich(node, multiline);
        const range = saved.current ?? { s: 0, e: text.length };
        const lines = text.split("\n");
        let position = 0;
        const starts = lines.map((line) => {
          const at = position;
          position += line.length + 1;
          return at;
        });
        const chosen = lines.map((line, index) => {
          const start = starts[index] ?? 0;
          const end = start + line.length;
          return range.e > range.s ? end >= range.s && start <= range.e : true;
        });
        const targets = lines.filter((line, index) => chosen[index] && line.trim());
        const on = targets.length > 0 && targets.every((line) => (kind === "bullet" ? line.startsWith("• ") : /^\d{1,2}\. /.test(line)));
        let number = 0;
        // From the last line up, so the earlier offsets stay valid.
        const edits = lines.map((line, index) => {
          if (!chosen[index] || !line.trim()) return line;
          const bare = line.replace(bullet, "");
          if (on) return bare;
          number += 1;
          return kind === "bullet" ? `• ${bare}` : `${number}. ${bare}`;
        });
        for (let index = lines.length - 1; index >= 0; index -= 1) {
          const before = text;
          const start = starts[index] ?? 0;
          const after = before.slice(0, start) + edits[index] + before.slice(start + (lines[index] ?? "").length);
          marks = remapMarks(marks, before, after);
          text = after;
        }
        rewrite(text, marks, { s: text.length, e: text.length });
      },
    };
  });

  const close = (revert = false) => {
    if (closed.current) return;
    closed.current = true;
    if (revert) {
      if (timer.current) clearTimeout(timer.current);
      if (last.current !== initialKey) onCommit(initial, initialMarks);
    } else {
      flush();
    }
    onClose();
  };

  // Mount: fill the field once, focus it and put the caret where the click was.
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.contentEditable = "true";
    renderRich(node, initial, initialMarks, multiline);
    node.focus({ preventScroll: true });
    placeCaret(node, point, selectAll);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // The session is keyed by its anchor: the initial value and the click point are read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the printed text: position, width and type, re-read after every render of the sheet.
  // A field can print twice (a section label and a display heading): the session sits on the one
  // that was clicked, and only that one is hidden underneath.
  useLayoutEffect(() => {
    const sources = Array.from(content.querySelectorAll<HTMLElement>(anchorSelector(anchor)));
    if (occurrence.current === null) occurrence.current = point ? nearestTo(sources, point) : 0;
    const source = sources[occurrence.current] ?? sources[0];
    for (const other of content.querySelectorAll<HTMLElement>("[data-ve-editing]")) if (other !== source) other.removeAttribute("data-ve-editing");
    const outer = box.current;
    const inner = field.current;
    if (!outer || !inner) return;
    if (!source) {
      outer.style.visibility = "hidden";
      return;
    }
    source.setAttribute("data-ve-editing", "");
    outer.style.visibility = "";
    const rect = relativeRect(source, content);
    outer.style.left = `${rect.x}px`;
    outer.style.top = `${rect.y}px`;
    const type = getComputedStyle(typeSource(source));
    for (const key of copied) inner.style[key] = type[key];
    inner.style.minHeight = `${rect.h / zoom}px`;
    if (multiline) {
      outer.style.width = `${rect.w}px`;
      inner.style.width = `${rect.w / zoom}px`;
    } else {
      // A single line grows with the text, up to the edge of its block, never past the sheet.
      const block = source.closest<HTMLElement>("[data-block-id]");
      let sheet: HTMLElement = source;
      while (sheet.parentElement && !sheet.parentElement.classList.contains("qd-sheets")) sheet = sheet.parentElement;
      const blockBox = block ? relativeRect(block, content) : rect;
      const sheetBox = relativeRect(sheet, content);
      const bounds = { x: blockBox.x, w: Math.min(blockBox.x + blockBox.w, sheetBox.x + sheetBox.w - 8) - blockBox.x };
      outer.style.width = "";
      inner.style.width = "max-content";
      inner.style.minWidth = `${rect.w / zoom}px`;
      inner.style.maxWidth = `${Math.max(rect.w, bounds.x + bounds.w - rect.x) / zoom}px`;
    }
  });

  useEffect(
    () => () => {
      for (const element of content.querySelectorAll("[data-ve-editing]")) element.removeAttribute("data-ve-editing");
    },
    [content],
  );

  // The selection is remembered while the toolbar has the focus (a colour field, the font search).
  useEffect(() => {
    const onChange = () => {
      const node = field.current;
      if (!node || document.activeElement !== node) return;
      const range = selectionOffsets(node);
      saved.current = range;
      onSelection?.(range);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  });

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (box.current && event.target instanceof Node && box.current.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest("[data-ve-text-ui]")) return;
      close();
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  });

  const near = limit !== null && (limit <= 400 || length > limit * 0.8);
  return (
    <div ref={box} className={error ? "ve-session has-error" : "ve-session"} data-ve-ui="">
      <div
        ref={field}
        className="ve-session-field"
        role="textbox"
        aria-label={label}
        aria-multiline={multiline || undefined}
        aria-invalid={error ? true : undefined}
        lang="it"
        spellCheck
        data-native-undo=""
        suppressContentEditableWarning
        onInput={(event) => {
          const value = readRich(event.currentTarget, multiline).text;
          setLength(value.length);
          if (composing.current) return;
          schedule();
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          schedule();
        }}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, multiline ? text : text.replace(/\s*\n\s*/g, " "));
        }}
        onKeyDown={(event) => {
          if (composing.current) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close(true);
          } else if (event.key === "Enter" && (!multiline || event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            close();
          } else if (event.key === "Enter" && multiline) {
            // A line break, never a new block element.
            event.preventDefault();
            document.execCommand("insertLineBreak");
          } else if ((event.metaKey || event.ctrlKey) && !event.altKey && ["b", "i", "u"].includes(event.key.toLowerCase())) {
            // Bold, italic, underline on the selected words: same marks as the toolbar.
            event.preventDefault();
            const key = event.key.toLowerCase() as "b" | "i" | "u";
            const node = event.currentTarget;
            const range = selectionOffsets(node);
            if (range && range.e > range.s) {
              const { marks } = readRich(node, multiline);
              const covered = marks.some((mark) => mark[key] && mark.s <= range.s && mark.e >= range.e);
              apiRef?.current?.mark({ [key]: !covered }, range);
            }
          } else if (event.key === "Tab") {
            event.preventDefault();
            flush();
            closed.current = true;
            onTab(event.shiftKey);
          }
        }}
      />
      <div className="ve-session-meta" aria-live="polite">
        {error ? <span className="ve-session-error">{error}</span> : null}
        {near && limit !== null ? (
          <span className={length > limit ? "ve-count is-over" : "ve-count"}>
            {length} / {limit}
          </span>
        ) : null}
        <span className="ve-keys">
          {multiline ? "Invio va a capo" : "Invio conferma"} · <kbd>Esc</kbd> annulla
        </span>
      </div>
    </div>
  );
}
