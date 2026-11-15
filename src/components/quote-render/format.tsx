import type { ReactNode } from "react";
import { getField, type EditAnchor } from "@/domain/document-ops";
import { fontFamilyName, isFontRef, type FontRef } from "@/domain/fonts";
import type { QuoteBlock, QuoteDocument } from "@/domain/quote-document";
import { fieldRole, splitRuns, type BlockLook, type MarkAttrs, type TextFormat } from "@/domain/text-format";
import { flatten, type Kit, type Style, type TextProps, type ViewProps } from "./kit";

/**
 * Formatting layer shared by the web preview, the visual editor, the public page and the PDF.
 * It wraps any kit: anchored texts get their element style, inline marks become nested texts of
 * the same kit (spans on the web, nested Text in the PDF), blocks get their look. Templates stay
 * untouched and nothing here ever produces HTML from user data.
 */

export type FormatContext = {
  blocks: Map<string, QuoteBlock>;
  /** Brand Kit fonts applied to headings and body text. */
  brand: { heading: FontRef | null; body: FontRef | null };
  /** PDF: only fonts that were registered can be used; the template font stays otherwise. */
  usable: (ref: FontRef) => boolean;
};

export function brandFontRef(value: string | null | undefined): FontRef | null {
  return isFontRef(value) ? value : null;
}

export function formatContext(document: QuoteDocument, brand: { fontHeading?: string | null; fontBody?: string | null }, usable: (ref: FontRef) => boolean = () => true): FormatContext {
  return {
    blocks: new Map(document.blocks.map((block) => [block.id, block])),
    brand: { heading: brandFontRef(brand.fontHeading), body: brandFontRef(brand.fontBody) },
    usable,
  };
}

function family(kit: Kit, ref: FontRef, fallback: unknown): string {
  const name = fontFamilyName(ref);
  if (kit.mode === "pdf") return name;
  // The web keeps the template family behind, so text never flashes in a default face.
  return typeof fallback === "string" && fallback ? `"${name}", ${fallback}` : `"${name}", system-ui, sans-serif`;
}

function decoration(underline: boolean | undefined, strike: boolean | undefined, current: unknown): string | undefined {
  const base = typeof current === "string" ? current : "none";
  const u = underline ?? base.includes("underline");
  const x = strike ?? base.includes("line-through");
  if (underline === undefined && strike === undefined) return undefined;
  return [u ? "underline" : "", x ? "line-through" : ""].filter(Boolean).join(" ") || "none";
}

/** The element style of a field, on top of what the template set. */
export function elementStyle(kit: Kit, format: TextFormat | undefined, base: Style, brandFont: FontRef | null, usable: (ref: FontRef) => boolean): Style {
  const out: Style = {};
  const ref = format?.font ?? brandFont;
  if (ref && usable(ref)) out.fontFamily = family(kit, ref, base.fontFamily);
  if (!format) return out;
  if (format.size !== undefined) out.fontSize = format.size;
  if (format.bold !== undefined) out.fontWeight = format.bold ? 700 : 400;
  if (format.weight !== undefined) out.fontWeight = format.weight;
  if (format.italic !== undefined) out.fontStyle = format.italic ? "italic" : "normal";
  const deco = decoration(format.underline, format.strike, base.textDecoration);
  if (deco) out.textDecoration = deco;
  if (format.color) out.color = format.color;
  if (format.highlight) out.backgroundColor = format.highlight;
  if (format.align) out.textAlign = format.align;
  if (format.lineHeight !== undefined) out.lineHeight = format.lineHeight;
  if (format.tracking !== undefined) {
    const size = typeof out.fontSize === "number" ? out.fontSize : typeof base.fontSize === "number" ? base.fontSize : 10;
    out.letterSpacing = Math.round(format.tracking * size * 100) / 100;
  }
  if (format.case) out.textTransform = format.case === "upper" ? "uppercase" : "none";
  return out;
}

export function markStyle(kit: Kit, attrs: MarkAttrs, base: Style, usable: (ref: FontRef) => boolean): Style {
  const out: Style = {};
  if (attrs.b) out.fontWeight = 700;
  if (attrs.i) out.fontStyle = "italic";
  const deco = [attrs.u || attrs.href ? "underline" : "", attrs.x ? "line-through" : ""].filter(Boolean).join(" ");
  if (deco) out.textDecoration = deco;
  if (attrs.c) out.color = attrs.c;
  if (attrs.h) out.backgroundColor = attrs.h;
  if (attrs.z) out.fontSize = attrs.z;
  if (attrs.f && usable(attrs.f as FontRef)) out.fontFamily = family(kit, attrs.f as FontRef, base.fontFamily);
  return out;
}

/** Where the printed string sits inside the stored value, or null when it is not the value (a placeholder). */
export function locate(printed: string, value: string, offset: number | null): number | null {
  if (!value) return null;
  if (offset !== null) return value.slice(offset, offset + printed.length) === printed ? offset : null;
  if (printed === value) return 0;
  // Templates may break a long title onto lines: a space printed as a line break keeps offsets.
  const flat = (text: string) => text.replace(/\s/g, " ");
  if (printed.length === value.length && flat(printed) === flat(value)) return 0;
  const inside = printed.indexOf(value);
  if (inside >= 0) return -inside;
  const part = value.indexOf(printed);
  return part >= 0 ? part : null;
}

export function lookStyle(look: BlockLook | undefined): Style | null {
  if (!look) return null;
  const out: Style = {};
  if (look.mt !== undefined) out.marginTop = look.mt;
  if (look.mb !== undefined) out.marginBottom = look.mb;
  if (look.pad !== undefined) out.padding = look.pad;
  if (look.bg) out.backgroundColor = look.bg;
  if (look.border && (look.borderWidth ?? 1) > 0) {
    out.borderWidth = look.borderWidth ?? 1;
    out.borderColor = look.border;
    out.borderStyle = "solid";
  }
  if (look.radius !== undefined) out.borderRadius = look.radius;
  return Object.keys(out).length ? out : null;
}

const cache = new WeakMap<Kit, WeakMap<FormatContext, Kit>>();

/** The kit with formatting applied. One wrapped kit per kit and context, so React keeps the tree. */
export function withFormats(kit: Kit, context: FormatContext): Kit {
  let byContext = cache.get(kit);
  if (!byContext) {
    byContext = new WeakMap();
    cache.set(kit, byContext);
  }
  const hit = byContext.get(context);
  if (hit) return hit;
  const Base = kit.T;
  const BaseV = kit.V;
  const T = (props: TextProps) => {
    const target: { anchor: EditAnchor; offset: number | null } | null = props.rich ?? (props.edit ? { anchor: props.edit, offset: null } : null);
    if (!target) return <Base {...props} />;
    const block = context.blocks.get(target.anchor.blockId);
    const format = block?.fmt?.[target.anchor.field];
    const brandFont = context.brand[fieldRole(target.anchor.field)];
    if (!block || (!format && !brandFont)) return <Base {...props} />;
    const flat = flatten(props.style);
    const style: Style = { ...flat, ...elementStyle(kit, format, flat, brandFont, context.usable) };
    let children: ReactNode = props.children;
    const value = getField(block, target.anchor.field);
    if (format?.marks?.length && typeof children === "string" && typeof value === "string") {
      const at = locate(children, value, target.offset);
      if (at !== null) {
        const printed = children;
        children = splitRuns(printed, at, format.marks).map((run, index) =>
          run.attrs ? (
            <Base key={index} style={markStyle(kit, run.attrs, style, context.usable)} href={run.attrs.href}>
              {run.text}
            </Base>
          ) : (
            run.text
          ),
        );
      }
    }
    return (
      <Base {...props} style={style}>
        {children}
      </Base>
    );
  };
  const V = (props: ViewProps) => {
    const look = props.blockId ? lookStyle(context.blocks.get(props.blockId)?.look) : null;
    if (!look) return <BaseV {...props} />;
    return <BaseV {...props} style={{ ...flatten(props.style), ...look }} />;
  };
  const wrapped: Kit = { ...kit, T, V };
  byContext.set(context, wrapped);
  return wrapped;
}
