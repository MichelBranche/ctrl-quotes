"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EditAnchor } from "@/domain/document-ops";
import { cssValue, relativeRect } from "./geometry";

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

function supportsPlaintext(): boolean {
  const probe = document.createElement("div");
  try {
    probe.contentEditable = "plaintext-only";
  } catch {
    return false;
  }
  return probe.contentEditable === "plaintext-only";
}

function readText(element: HTMLElement, multiline: boolean): string {
  const text = (element.innerText ?? element.textContent ?? "").replace(/\r/g, "").replace(/\u00a0/g, " ");
  return multiline ? text.replace(/\n$/, "") : text.replace(/\n+/g, " ");
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
  limit: number | null;
  label: string;
  content: HTMLElement;
  zoom: number;
  point: { x: number; y: number } | null;
  selectAll: boolean;
  /** Returns an error message when the value is refused. */
  onCommit: (value: string) => string | null;
  onClose: () => void;
  onTab: (backwards: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(initial);
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
    const value = readText(node, multiline);
    if (value === last.current) return;
    const problem = onCommit(value);
    setError(problem);
    if (!problem) last.current = value;
  };

  const close = (revert = false) => {
    if (closed.current) return;
    closed.current = true;
    if (revert) {
      if (timer.current) clearTimeout(timer.current);
      if (last.current !== initial) onCommit(initial);
    } else {
      flush();
    }
    onClose();
  };

  // Mount: fill the field once, focus it and put the caret where the click was.
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.contentEditable = supportsPlaintext() ? "plaintext-only" : "true";
    node.textContent = initial;
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

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (box.current && event.target instanceof Node && box.current.contains(event.target)) return;
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
          const value = readText(event.currentTarget, multiline);
          setLength(value.length);
          if (composing.current) return;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(flush, COMMIT_MS);
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(flush, COMMIT_MS);
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
          } else if (event.key === "Enter" && multiline && event.currentTarget.contentEditable !== "plaintext-only") {
            // Rich editing fallback (older browsers): a line break, never a new block element.
            event.preventDefault();
            document.execCommand("insertLineBreak");
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
