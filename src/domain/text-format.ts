import { z } from "zod";
import { isFontRef, type FontRef } from "@/domain/fonts";

/**
 * Text formatting of the quote body, stored as data, never as HTML. Each block may carry `fmt`:
 * per field (the same path the visual editor writes, e.g. "heading" or "items.<id>.name") an
 * element style and optional inline marks, character ranges over the plain text of the field.
 * The plain text stays the single source of the words: old documents parse as before, every
 * renderer prints text nodes, and a mark can only carry the closed set of properties below.
 */

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const font = z.string().refine(isFontRef);
/** Web links only: https, mailto and tel. Anything else (javascript:, data:) is refused. */
export const linkSchema = z
  .string()
  .max(500)
  .refine((value) => /^(https:\/\/[^\s<>"']+|mailto:[^\s<>"']+|tel:\+?[0-9 ().-]{3,30})$/i.test(value), { error: "Link non valido: usa https://, mailto: o tel:." });

export const markSchema = z.object({
  s: z.number().int().min(0).max(10000),
  e: z.number().int().min(1).max(10000),
  b: z.boolean().optional(),
  i: z.boolean().optional(),
  u: z.boolean().optional(),
  x: z.boolean().optional(),
  c: hex.optional(),
  h: hex.optional(),
  f: font.optional(),
  z: z.number().min(4).max(200).optional(),
  href: linkSchema.optional(),
});
export type Mark = z.infer<typeof markSchema>;
export type MarkAttrs = Omit<Mark, "s" | "e">;
export const markKeys = ["b", "i", "u", "x", "c", "h", "f", "z", "href"] as const;

export const textAligns = ["left", "center", "right", "justify"] as const;

export const textFormatSchema = z.object({
  font: font.optional(),
  size: z.number().min(4).max(200).optional(),
  bold: z.boolean().optional(),
  /** Exact weight from the side panel; wins over `bold`. */
  weight: z.number().int().min(100).max(900).multipleOf(100).optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strike: z.boolean().optional(),
  color: hex.optional(),
  highlight: hex.optional(),
  align: z.enum(textAligns).optional(),
  lineHeight: z.number().min(0.6).max(3).optional(),
  /** Letter spacing in em, so it follows the size. */
  tracking: z.number().min(-0.2).max(1).optional(),
  case: z.enum(["none", "upper"]).optional(),
  marks: z.array(markSchema).max(300).optional(),
});
export type TextFormat = z.infer<typeof textFormatSchema>;

export const fieldFormatsSchema = z.record(z.string().min(1).max(120), textFormatSchema).refine((value) => Object.keys(value).length <= 400);
export type FieldFormats = z.infer<typeof fieldFormatsSchema>;

/** Look of a whole block on the page: spacing, background, border, corners. Absent: the template's. */
export const blockLookSchema = z.object({
  /** Space above and below the block, in pt. */
  mt: z.number().min(0).max(120).optional(),
  mb: z.number().min(0).max(120).optional(),
  /** Inner padding, in pt. */
  pad: z.number().min(0).max(60).optional(),
  bg: hex.optional(),
  border: hex.optional(),
  borderWidth: z.number().min(0).max(8).optional(),
  radius: z.number().min(0).max(40).optional(),
});
export type BlockLook = z.infer<typeof blockLookSchema>;

function sameAttrs(a: MarkAttrs, b: MarkAttrs): boolean {
  return markKeys.every((key) => a[key] === b[key]);
}

function attrsOf(mark: Mark): MarkAttrs {
  const out: Record<string, unknown> = {};
  for (const key of markKeys) if (mark[key] !== undefined && mark[key] !== false) out[key] = mark[key];
  return out as MarkAttrs;
}

function isEmpty(attrs: MarkAttrs): boolean {
  return markKeys.every((key) => attrs[key] === undefined);
}

/**
 * Sorted, non overlapping, merged marks clipped to the text. Later marks win where they overlap,
 * so a mark list can be edited by appending.
 */
export function normalizeMarks(marks: readonly Mark[], length: number): Mark[] {
  const cuts = new Set<number>([0, length]);
  for (const mark of marks) {
    cuts.add(Math.max(0, Math.min(length, mark.s)));
    cuts.add(Math.max(0, Math.min(length, mark.e)));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: Mark[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const s = points[index] as number;
    const e = points[index + 1] as number;
    if (e <= s) continue;
    let attrs: MarkAttrs = {};
    for (const mark of marks) if (mark.s <= s && mark.e >= e) attrs = { ...attrs, ...attrsOf(mark) };
    attrs = attrsOf({ s, e, ...attrs });
    if (isEmpty(attrs)) continue;
    const last = out[out.length - 1];
    if (last && last.e === s && sameAttrs(attrsOf(last), attrs)) last.e = e;
    else out.push({ s, e, ...attrs });
  }
  return out;
}

/** Sets (or with `undefined`/false clears) attributes on a range. */
export function applyMark(marks: readonly Mark[], length: number, s: number, e: number, patch: Partial<MarkAttrs>): Mark[] {
  if (e <= s) return normalizeMarks(marks, length);
  const pieces = normalizeMarks(marks, length);
  const cuts = new Set<number>([s, e]);
  for (const mark of pieces) {
    cuts.add(mark.s);
    cuts.add(mark.e);
  }
  const points = [...cuts].filter((point) => point >= 0 && point <= length).sort((a, b) => a - b);
  const out: Mark[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index] as number;
    const to = points[index + 1] as number;
    const current = pieces.find((mark) => mark.s <= from && mark.e >= to);
    let attrs: Record<string, unknown> = current ? { ...attrsOf(current) } : {};
    if (from >= s && to <= e) {
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === false || value === null) delete attrs[key];
        else attrs[key] = value;
      }
    }
    attrs = attrsOf({ s: from, e: to, ...(attrs as MarkAttrs) });
    if (!isEmpty(attrs as MarkAttrs)) out.push({ s: from, e: to, ...(attrs as MarkAttrs) });
  }
  return normalizeMarks(out, length);
}

/** Attribute shared by the whole range, or undefined when it varies or is absent somewhere. */
export function markValueIn<K extends keyof MarkAttrs>(marks: readonly Mark[], s: number, e: number, key: K): MarkAttrs[K] | undefined {
  if (e <= s) {
    const at = marks.find((mark) => mark.s < s && mark.e >= s) ?? marks.find((mark) => mark.s <= s && mark.e > s);
    return at?.[key];
  }
  let value: MarkAttrs[K] | undefined;
  let position = s;
  for (const mark of normalizeMarks(marks, Math.max(e, ...marks.map((m) => m.e)))) {
    if (mark.e <= s || mark.s >= e) continue;
    if (mark.s > position) return undefined;
    const next = mark[key];
    if (next === undefined) return undefined;
    if (value !== undefined && value !== next) return undefined;
    value = next;
    position = mark.e;
  }
  return position >= e ? value : undefined;
}

/**
 * Keeps marks on the same words after the text changes elsewhere (the form editor, a paste):
 * the common start and end are kept, marks inside the changed part stretch or shrink with it.
 */
export function remapMarks(marks: readonly Mark[], before: string, after: string): Mark[] {
  if (before === after || !marks.length) return normalizeMarks(marks, after.length);
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore -= 1;
    endAfter -= 1;
  }
  const delta = endAfter - endBefore;
  const map = (point: number, isEnd: boolean) => {
    // Typing right before a mark does not pull the new text into it.
    if (!isEnd && point === start && endBefore === start) return point + delta;
    if (point <= start) return point;
    if (point >= endBefore) return point + delta;
    // Inside the replaced part: a mark that started before keeps covering the new text.
    return isEnd ? endAfter : start;
  };
  return normalizeMarks(
    marks.map((mark) => ({ ...mark, s: map(mark.s, false), e: map(mark.e, true) })).filter((mark) => mark.e > mark.s),
    after.length,
  );
}

export type Run = { text: string; attrs: MarkAttrs | null; from: number };

/** Splits `text`, which starts at `offset` inside the field value, into runs with their marks. */
export function splitRuns(text: string, offset: number, marks: readonly Mark[]): Run[] {
  const runs: Run[] = [];
  let position = 0;
  for (const mark of marks) {
    const s = Math.max(0, mark.s - offset);
    const e = Math.min(text.length, mark.e - offset);
    if (e <= s || e <= position) continue;
    if (s > position) runs.push({ text: text.slice(position, s), attrs: null, from: offset + position });
    runs.push({ text: text.slice(Math.max(s, position), e), attrs: attrsOf(mark), from: offset + Math.max(s, position) });
    position = e;
  }
  if (position < text.length) runs.push({ text: text.slice(position), attrs: null, from: offset + position });
  return runs;
}

/** Fonts a document uses, for loading on the web and embedding in the PDF. */
export function fontsInFormats(formats: Iterable<FieldFormats | undefined>): FontRef[] {
  const out = new Set<FontRef>();
  for (const map of formats) {
    if (!map) continue;
    for (const format of Object.values(map)) {
      if (format.font) out.add(format.font as FontRef);
      for (const mark of format.marks ?? []) if (mark.f) out.add(mark.f as FontRef);
    }
  }
  return [...out];
}

/** True when an element format carries nothing. */
export function isEmptyFormat(format: TextFormat | undefined): boolean {
  if (!format) return true;
  return Object.entries(format).every(([key, value]) => value === undefined || (key === "marks" && Array.isArray(value) && value.length === 0));
}

/** Fields that print as headings take the Brand Kit heading font, the others the body font. */
export function fieldRole(field: string): "heading" | "body" {
  const last = field.split(".").pop() ?? field;
  if (field.startsWith("items.") && last === "title") return "heading";
  return ["title", "heading", "lead", "quote"].includes(last) && !field.startsWith("steps.") ? "heading" : "body";
}
