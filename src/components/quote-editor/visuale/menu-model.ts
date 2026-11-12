import { applyCommand } from "@/domain/document-ops";
import { singletonBlocks, type BlockType, type QuoteDocument } from "@/domain/quote-document";

/** The order blocks are offered in, by the picker and by the right click menu. */
export const contentTypes: BlockType[] = ["text", "image", "services", "options", "highlights", "terms", "intro"];
export const onceTypes: BlockType[] = ["summary", "timeline", "contacts", "cover"];

/** A point on the sheet, in canvas content coordinates (the same ones the geometry uses). */
export type Point = { x: number; y: number };
export type Box = { id: string; x: number; y: number; w: number; h: number };
export type Gap = { key: string; x: number; y: number; w: number; index: number; where: string };

/** What a right click lands on: a printed block, or the gap where a new block would go. */
export type MenuTarget = { kind: "block"; id: string } | { kind: "gap"; gap: Gap };

/**
 * The block under the pointer wins; anywhere else the closest insertion point does, so a right click
 * in the margin between two sections means "here, between these two".
 */
export function hitTarget(point: Point, boxes: Box[], gaps: Gap[]): MenuTarget | null {
  const inside = boxes.find((box) => point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h);
  if (inside) return { kind: "block", id: inside.id };
  let best: Gap | null = null;
  for (const gap of gaps) if (!best || Math.abs(gap.y - point.y) < Math.abs(best.y - point.y)) best = gap;
  return best ? { kind: "gap", gap: best } : null;
}

export type BlockActions = {
  moveUp: boolean;
  moveDown: boolean;
  duplicate: boolean;
  remove: boolean;
  /** Hiding and locking are always possible on an editable quote; the cover can be hidden too. */
  toggle: boolean;
  lock: boolean;
  /** Text edits and inserting next to it: off while the content is locked. */
  edit: boolean;
  insertBefore: boolean;
};

/** Which block actions the model would accept right now, checked with the same rules as the commands. */
export function blockActions(document: QuoteDocument, blockId: string, readOnly: boolean): BlockActions {
  const at = document.blocks.findIndex((block) => block.id === blockId);
  const block = document.blocks[at];
  const none: BlockActions = { moveUp: false, moveDown: false, duplicate: false, remove: false, toggle: false, lock: false, edit: false, insertBefore: false };
  if (!block || readOnly) return none;
  const ok = (command: Parameters<typeof applyCommand>[1]) => applyCommand(document, command, { order: "template" }).ok;
  return {
    moveUp: at > 0 && ok({ kind: "moveBlock", blockId, toIndex: at - 1 }),
    moveDown: at < document.blocks.length - 1 && ok({ kind: "moveBlock", blockId, toIndex: at + 1 }),
    duplicate: ok({ kind: "duplicateBlock", blockId }),
    remove: ok({ kind: "removeBlock", blockId }),
    toggle: true,
    lock: true,
    edit: !block.locked,
    // Nothing goes above the cover.
    insertBefore: block.type !== "cover",
  };
}

export type AddableType = { type: BlockType; taken: boolean };

/** Block types the "Aggiungi" submenu offers: everything but the cover, singletons already present switched off. */
export function addableTypes(document: QuoteDocument): { content: AddableType[]; once: AddableType[] } {
  const present = new Set(document.blocks.map((block) => block.type));
  const entry = (type: BlockType) => ({ type, taken: singletonBlocks.has(type) && present.has(type) });
  return { content: contentTypes.map(entry), once: onceTypes.filter((type) => type !== "cover").map(entry) };
}

/** The first item whose label starts with the typed letters, after the current one (menu type-ahead). */
export function typeahead(labels: Array<string | null>, current: number, query: string): number {
  const q = query.toLowerCase();
  if (!q) return current;
  for (let step = 1; step <= labels.length; step += 1) {
    const index = (current + step) % labels.length;
    const label = labels[index];
    if (label && label.toLowerCase().startsWith(q)) return index;
  }
  return current;
}
