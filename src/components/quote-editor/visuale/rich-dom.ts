import { fontFamilyName, type FontRef } from "@/domain/fonts";
import { markKeys, normalizeMarks, splitRuns, type Mark, type MarkAttrs } from "@/domain/text-format";

/**
 * The editable field of a text session holds the text as text nodes in spans, one span per run
 * of marks (data-m carries the attributes as JSON), and <br> for line breaks. It is built with
 * DOM calls, never from an HTML string, and read back into plain text plus marks.
 */

export function markCss(attrs: MarkAttrs): Partial<CSSStyleDeclaration> {
  const css: Partial<CSSStyleDeclaration> = {};
  if (attrs.b) css.fontWeight = "700";
  if (attrs.i) css.fontStyle = "italic";
  const deco = [attrs.u || attrs.href ? "underline" : "", attrs.x ? "line-through" : ""].filter(Boolean).join(" ");
  if (deco) css.textDecoration = deco;
  if (attrs.c) css.color = attrs.c;
  if (attrs.h) css.backgroundColor = attrs.h;
  if (attrs.z) css.fontSize = `${attrs.z}pt`;
  if (attrs.f) css.fontFamily = `"${fontFamilyName(attrs.f as FontRef)}", inherit`;
  return css;
}

function appendText(parent: Node, text: string) {
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (index) parent.appendChild(document.createElement("br"));
    if (line) parent.appendChild(document.createTextNode(line));
  });
}

export function renderRich(field: HTMLElement, text: string, marks: readonly Mark[], multiline: boolean) {
  field.replaceChildren();
  for (const run of splitRuns(text, 0, normalizeMarks(marks, text.length))) {
    if (!run.attrs) {
      appendText(field, run.text);
      continue;
    }
    const span = document.createElement("span");
    span.dataset.m = JSON.stringify(run.attrs);
    Object.assign(span.style, markCss(run.attrs));
    appendText(span, run.text);
    field.appendChild(span);
  }
  // A trailing line break needs a second <br> to show the empty line.
  if (multiline && text.endsWith("\n")) field.appendChild(document.createElement("br"));
}

function attrsFrom(node: Node, field: HTMLElement): MarkAttrs | null {
  let element = node.parentElement;
  while (element && element !== field) {
    const raw = element.dataset?.m;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const key of markKeys) if (parsed[key] !== undefined) out[key] = parsed[key];
        return out as MarkAttrs;
      } catch {
        return null;
      }
    }
    element = element.parentElement;
  }
  return null;
}

type Piece = { node: Node; start: number; length: number; text: string; attrs: MarkAttrs | null };

const blockTags = new Set(["DIV", "P", "LI"]);

/** Text pieces in order, with their offsets. Block elements a browser may insert count as a line break. */
export function pieces(field: HTMLElement): Piece[] {
  const out: Piece[] = [];
  let position = 0;
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent ?? "").replace(/\r/g, "").replace(/\u00a0/g, " ").replace(/\u200b/g, "");
        out.push({ node: child, start: position, length: (child.textContent ?? "").length, text, attrs: attrsFrom(child, field) });
        position += text.length;
      } else if (child.nodeName === "BR") {
        out.push({ node: child, start: position, length: 1, text: "\n", attrs: null });
        position += 1;
      } else if (child instanceof HTMLElement) {
        if (blockTags.has(child.nodeName) && position > 0) {
          out.push({ node: child, start: position, length: 0, text: "\n", attrs: null });
          position += 1;
        }
        walk(child);
      }
    }
  };
  walk(field);
  return out;
}

export function readRich(field: HTMLElement, multiline: boolean): { text: string; marks: Mark[] } {
  const list = pieces(field);
  let text = "";
  const marks: Mark[] = [];
  for (const piece of list) {
    if (piece.attrs && piece.text) marks.push({ s: text.length, e: text.length + piece.text.length, ...piece.attrs });
    text += piece.text;
  }
  if (multiline) text = text.replace(/\n$/, "");
  else text = text.replace(/\n+/g, " ");
  return { text, marks: normalizeMarks(marks, text.length) };
}

/** Character offsets of the current selection inside the field, or null when it is elsewhere. */
export function selectionOffsets(field: HTMLElement): { s: number; e: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!field.contains(range.startContainer) || !field.contains(range.endContainer)) return null;
  const at = (container: Node, offset: number) => {
    const probe = document.createRange();
    probe.selectNodeContents(field);
    probe.setEnd(container, offset);
    const fragment = probe.cloneContents();
    const holder = document.createElement("div");
    holder.appendChild(fragment);
    return pieces(holder).reduce((sum, piece) => sum + piece.text.length, 0);
  };
  const s = at(range.startContainer, range.startOffset);
  const e = at(range.endContainer, range.endOffset);
  return { s: Math.min(s, e), e: Math.max(s, e) };
}

export function restoreSelection(field: HTMLElement, s: number, e: number) {
  const list = pieces(field);
  const locate = (target: number): [Node, number] => {
    for (const piece of list) {
      if (piece.node.nodeType === Node.TEXT_NODE && target <= piece.start + piece.text.length && target >= piece.start) return [piece.node, target - piece.start];
      if (piece.node.nodeName === "BR" && target === piece.start) {
        const parent = piece.node.parentNode as Node;
        return [parent, Array.prototype.indexOf.call(parent.childNodes, piece.node)];
      }
    }
    return [field, field.childNodes.length];
  };
  const [startNode, startOffset] = locate(s);
  const [endNode, endOffset] = locate(e);
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
