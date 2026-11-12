import { createId } from "@/domain/ids";
import {
  blockLabel,
  blockSchema,
  limits,
  singletonBlocks,
  type BlockType,
  type DocumentStyle,
  type QuoteBlock,
  type QuoteDocument,
} from "@/domain/quote-document";

/**
 * Every change to a quote body goes through `applyCommand`: the form editor today, the visual
 * editor next. Commands are pure and typed, and the structural rules live here once.
 */

export type OpResult<T> = { ok: true; value: T } | { ok: false; message: string };

/** Plain text fields that blocks carry at their top level. */
export const blockTextFields = ["title", "subtitle", "tagline", "project", "heading", "body", "lead", "quote", "caption", "payment", "notes"] as const;
export type BlockTextField = (typeof blockTextFields)[number];
export type LineField = "name" | "description" | "quantityMilli" | "unitPriceCents";
export type HighlightField = "title" | "body";
export type StepField = "label" | "title";

/** Address of one editable value inside a block, e.g. "heading", "items.<lineId>.name", "points.0". */
export type FieldPath =
  | BlockTextField
  | `points.${number}`
  | `items.${string}.${LineField | HighlightField}`
  | `steps.${string}.${StepField}`;

/** How a value is edited on the page: free text on one or more lines, or a parsed number. */
export type EditKind = "line" | "multiline" | "money" | "quantity";

/** Where a printed value comes from, so the visual editor can write it back. */
export type EditAnchor = { blockId: string; field: FieldPath; kind: EditKind };

export type FieldValue = string | number;

const numericLineFields: ReadonlySet<string> = new Set(["quantityMilli", "unitPriceCents"]);

function parsePath(field: FieldPath): { head: string; id?: string; key?: string } {
  const [head = "", id, key] = field.split(".");
  return key === undefined ? { head, id } : { head, id, key };
}

/** Reads the raw (stored, untrimmed) value behind an anchor. Undefined when the path does not exist. */
export function getField(block: QuoteBlock, field: FieldPath): FieldValue | undefined {
  const { head, id, key } = parsePath(field);
  const record = block as unknown as Record<string, unknown>;
  if (head === "points" && block.type === "intro") {
    const index = Number(id);
    return Number.isInteger(index) ? block.points[index] : undefined;
  }
  if (head === "items" && id && key && "items" in block) {
    const item = (block.items as Array<{ id: string } & Record<string, unknown>>).find((entry) => entry.id === id);
    const value = item?.[key];
    return typeof value === "string" || typeof value === "number" ? value : undefined;
  }
  if (head === "steps" && id && key && block.type === "timeline") {
    const step = block.steps.find((entry) => entry.id === id) as (Record<string, unknown> & { id: string }) | undefined;
    const value = step?.[key];
    return typeof value === "string" ? value : undefined;
  }
  if (id !== undefined) return undefined;
  const value = record[head];
  return typeof value === "string" ? value : undefined;
}

/** Writes one value and validates the block with the same schema the server uses. */
export function setField(block: QuoteBlock, field: FieldPath, value: FieldValue): OpResult<QuoteBlock> {
  if (getField(block, field) === undefined) return { ok: false, message: "Questo campo non esiste più." };
  const { head, id, key } = parsePath(field);
  const numeric = head === "items" && key !== undefined && numericLineFields.has(key);
  if (numeric !== (typeof value === "number")) return { ok: false, message: "Valore non valido." };
  let next: Record<string, unknown>;
  if (head === "points" && block.type === "intro") {
    const index = Number(id);
    next = { ...block, points: block.points.map((point, position) => (position === index ? String(value) : point)) };
  } else if (head === "items" && id && key && "items" in block) {
    next = { ...block, items: (block.items as Array<{ id: string }>).map((item) => (item.id === id ? { ...item, [key]: value } : item)) };
  } else if (head === "steps" && id && key && block.type === "timeline") {
    next = { ...block, steps: block.steps.map((step) => (step.id === id ? { ...step, [key]: value } : step)) };
  } else {
    next = { ...block, [head]: value };
  }
  const parsed = blockSchema.safeParse(next);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Valore non valido." };
  return { ok: true, value: parsed.data };
}

export type DocumentCommand =
  /** The form editor replaces a whole block at a time. Type and id never change. */
  | { kind: "replaceBlock"; block: QuoteBlock }
  | { kind: "setField"; blockId: string; field: FieldPath; value: FieldValue }
  | { kind: "insertBlock"; block: QuoteBlock; index: number }
  | { kind: "moveBlock"; blockId: string; toIndex: number }
  /** New order of the same ids, e.g. from a drag and drop list. */
  | { kind: "reorderBlocks"; ids: string[] }
  | { kind: "duplicateBlock"; blockId: string }
  | { kind: "removeBlock"; blockId: string }
  | { kind: "toggleBlock"; blockId: string }
  /** Locks or unlocks the content of a block. A locked block can still move, hide and be copied. */
  | { kind: "lockBlock"; blockId: string; locked: boolean }
  | { kind: "setStyle"; style: DocumentStyle }
  | { kind: "setWithholding"; bp: number };

export type CommandOptions = {
  makeId?: () => string;
  /**
   * "template": the cover stays first, as every template prints it. The visual editor uses it.
   * "free": any order, as the form editor has always allowed (the renderer prints the cover first anyway).
   */
  order?: "free" | "template";
};

/** Structural rules of a document. Null when the document is valid. */
export function documentProblem(document: QuoteDocument, options: Pick<CommandOptions, "order"> = {}): string | null {
  if (document.blocks.length < 1) return "Il preventivo deve avere almeno un blocco.";
  if (document.blocks.length > limits.blocks) return `Al massimo ${limits.blocks} blocchi per preventivo.`;
  const ids = new Set<string>();
  const seen = new Map<BlockType, number>();
  let lines = 0;
  for (const block of document.blocks) {
    if (ids.has(block.id)) return "Due blocchi hanno lo stesso identificativo.";
    ids.add(block.id);
    seen.set(block.type, (seen.get(block.type) ?? 0) + 1);
    if (block.type === "services" || block.type === "options") lines += block.items.length;
  }
  for (const type of singletonBlocks) {
    if ((seen.get(type) ?? 0) > 1) return `Il blocco ${blockLabel[type]} può comparire una sola volta.`;
  }
  if (lines > limits.lines) return `Al massimo ${limits.lines} voci per preventivo.`;
  if (options.order === "template") {
    const cover = document.blocks.findIndex((block) => block.type === "cover");
    if (cover > 0) return "La copertina resta sempre in apertura.";
  }
  return null;
}

function withBlocks(document: QuoteDocument, blocks: QuoteBlock[]): QuoteDocument {
  return { ...document, blocks };
}

function copyBlock(block: QuoteBlock, makeId: () => string): QuoteBlock {
  const id = makeId();
  switch (block.type) {
    case "services":
    case "options":
      return { ...block, id, items: block.items.map((line) => ({ ...line, id: makeId() })) };
    case "highlights":
      return { ...block, id, items: block.items.map((item) => ({ ...item, id: makeId() })) };
    case "timeline":
      return { ...block, id, steps: block.steps.map((step) => ({ ...step, id: makeId() })) };
    default:
      return { ...block, id };
  }
}

/** A copy starts unlocked: it is new content to work on. */
function unlockedCopy(block: QuoteBlock, makeId: () => string): QuoteBlock {
  const copy = copyBlock(block, makeId);
  delete copy.locked;
  return copy;
}

export const lockedMessage = "Il blocco è bloccato: sbloccalo dalla struttura per modificarlo.";

export function isLocked(block: QuoteBlock | undefined | null): boolean {
  return Boolean(block?.locked);
}

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

/** Applies one command. Never mutates the input; refuses changes that break the document rules. */
export function applyCommand(document: QuoteDocument, command: DocumentCommand, options: CommandOptions = {}): OpResult<QuoteDocument> {
  const makeId = options.makeId ?? createId;
  const index = (id: string) => document.blocks.findIndex((block) => block.id === id);
  const missing = { ok: false as const, message: "Il blocco non esiste più." };
  let next: QuoteDocument;

  switch (command.kind) {
    case "replaceBlock": {
      const at = index(command.block.id);
      if (at < 0) return missing;
      if (document.blocks[at]?.type !== command.block.type) return { ok: false, message: "Il tipo di blocco non può cambiare." };
      if (isLocked(document.blocks[at])) return { ok: false, message: lockedMessage };
      next = withBlocks(document, document.blocks.map((block, position) => (position === at ? command.block : block)));
      break;
    }
    case "setField": {
      const at = index(command.blockId);
      const block = document.blocks[at];
      if (!block) return missing;
      if (isLocked(block)) return { ok: false, message: lockedMessage };
      const result = setField(block, command.field, command.value);
      if (!result.ok) return result;
      next = withBlocks(document, document.blocks.map((entry, position) => (position === at ? result.value : entry)));
      break;
    }
    case "insertBlock": {
      if (index(command.block.id) >= 0) return { ok: false, message: "Due blocchi hanno lo stesso identificativo." };
      const at = Math.max(0, Math.min(command.index, document.blocks.length));
      const blocks = [...document.blocks];
      blocks.splice(at, 0, command.block);
      next = withBlocks(document, blocks);
      break;
    }
    case "moveBlock": {
      const from = index(command.blockId);
      if (from < 0) return missing;
      const to = Math.max(0, Math.min(command.toIndex, document.blocks.length - 1));
      if (from === to) return { ok: true, value: document };
      next = withBlocks(document, move(document.blocks, from, to));
      break;
    }
    case "reorderBlocks": {
      const current = document.blocks.map((block) => block.id);
      if (command.ids.length !== current.length || [...command.ids].sort().join() !== [...current].sort().join()) {
        return { ok: false, message: "L'ordine dei blocchi non è più valido. Riprova." };
      }
      const byId = new Map(document.blocks.map((block) => [block.id, block]));
      next = withBlocks(document, command.ids.map((id) => byId.get(id) as QuoteBlock));
      break;
    }
    case "duplicateBlock": {
      const at = index(command.blockId);
      const source = document.blocks[at];
      if (!source) return missing;
      if (singletonBlocks.has(source.type)) return { ok: false, message: `Il blocco ${blockLabel[source.type]} può comparire una sola volta.` };
      const blocks = [...document.blocks];
      blocks.splice(at + 1, 0, unlockedCopy(source, makeId));
      next = withBlocks(document, blocks);
      break;
    }
    case "removeBlock": {
      const at = index(command.blockId);
      if (at < 0) return missing;
      if (isLocked(document.blocks[at])) return { ok: false, message: "Il blocco è bloccato: sbloccalo per eliminarlo." };
      if (document.blocks.length <= 1) return { ok: false, message: "Il preventivo deve avere almeno un blocco." };
      next = withBlocks(document, document.blocks.filter((block) => block.id !== command.blockId));
      break;
    }
    case "toggleBlock": {
      const at = index(command.blockId);
      if (at < 0) return missing;
      next = withBlocks(document, document.blocks.map((block, position) => (position === at ? { ...block, visible: !block.visible } : block)));
      break;
    }
    case "lockBlock": {
      const at = index(command.blockId);
      if (at < 0) return missing;
      next = withBlocks(
        document,
        document.blocks.map((block, position) => {
          if (position !== at) return block;
          const copy = { ...block };
          delete copy.locked;
          return command.locked ? { ...copy, locked: true } : copy;
        }),
      );
      break;
    }
    case "setStyle":
      next = { ...document, style: command.style };
      break;
    case "setWithholding":
      if (!Number.isInteger(command.bp) || command.bp < 0 || command.bp > 5000) return { ok: false, message: "Ritenuta non valida." };
      next = { ...document, withholdingBp: command.bp };
      break;
    default: {
      const exhaustive: never = command;
      throw new Error(`Comando sconosciuto: ${String(exhaustive)}`);
    }
  }

  const problem = documentProblem(next, options);
  // A rule that was already broken before the command (old drafts) never blocks unrelated edits.
  if (problem && problem !== documentProblem(document, options)) return { ok: false, message: problem };
  return { ok: true, value: next };
}

/** Where a new block lands: right after the selected one, or at the end. */
/**
 * Where a new block goes: right after the selected one, unless that is the cover or the
 * closing contacts (signature), or nothing is selected. Then it goes at the end of the
 * content, before the Riepilogo (or before the contacts), never after the signature.
 */
export function insertionIndex(document: QuoteDocument, afterId: string | null): number {
  const at = afterId ? document.blocks.findIndex((block) => block.id === afterId) : -1;
  const anchor = document.blocks[at];
  if (anchor && anchor.type !== "cover" && anchor.type !== "contacts") return at + 1;
  return contentEnd(document);
}

/** Index just before the Riepilogo, else before the contacts, else the end. */
export function contentEnd(document: QuoteDocument): number {
  const summary = document.blocks.findIndex((block) => block.type === "summary");
  if (summary >= 0) return summary;
  const contacts = document.blocks.findIndex((block) => block.type === "contacts");
  return contacts >= 0 ? contacts : document.blocks.length;
}

/** Maximum length of a text field, the same as the schema. Null for numbers. */
export function fieldLimit(block: QuoteBlock, field: FieldPath): number | null {
  const { head, key } = parsePath(field);
  if (head === "items" && key) {
    if (key === "name") return block.type === "highlights" ? null : limits.lineName;
    if (key === "description") return limits.lineDescription;
    if (key === "title") return 80;
    if (key === "body") return 300;
    if (key === "unit") return 30;
    return null;
  }
  if (head === "steps") return key === "label" ? 60 : 140;
  if (head === "points") return 200;
  switch (head) {
    case "title":
    case "heading":
      return limits.heading;
    case "subtitle":
      return 400;
    case "tagline":
      return 120;
    case "project":
      return 80;
    case "body":
      return limits.body;
    case "lead":
      return 200;
    case "quote":
    case "caption":
      return 300;
    case "payment":
    case "notes":
      return 1000;
    default:
      return null;
  }
}
