import { z } from "zod";
import { textFormatSchema, type TextFormat } from "@/domain/text-format";

/**
 * Saved text styles of a workspace (Brand Kit): Titolo, Sottotitolo, Testo, Evidenza. Applying a
 * style copies its values into the element format of the text, so the public link and the PDF
 * render it exactly like any other formatting, and a later change to the style never rewrites
 * quotes already written.
 */

export const textStyleKeys = ["title", "subtitle", "body", "accent"] as const;
export type TextStyleKey = (typeof textStyleKeys)[number];

export const textStyleLabel: Record<TextStyleKey, string> = {
  title: "Titolo",
  subtitle: "Sottotitolo",
  body: "Testo",
  accent: "Evidenza",
};

/** The element properties a style sets; everything else (alignment, marks, links) is left alone. */
export const styleProps = ["font", "size", "weight", "italic", "color", "lineHeight", "tracking", "case"] as const;

export const textStyleSchema = textFormatSchema.pick({ font: true, size: true, weight: true, italic: true, color: true, lineHeight: true, tracking: true, case: true });
export type TextStyle = z.infer<typeof textStyleSchema>;

export const textStylesSchema = z.object({
  title: textStyleSchema,
  subtitle: textStyleSchema,
  body: textStyleSchema,
  accent: textStyleSchema,
});
export type TextStyles = z.infer<typeof textStylesSchema>;

export const defaultTextStyles: TextStyles = {
  title: { size: 28, weight: 700, lineHeight: 1.15, tracking: -0.01 },
  subtitle: { size: 16, weight: 600, lineHeight: 1.3 },
  body: { size: 11, weight: 400, lineHeight: 1.5 },
  accent: { size: 12, weight: 600, case: "upper", tracking: 0.08 },
};

/** Stored JSON to styles: anything missing or invalid falls back to the default of that style. */
export function parseTextStyles(raw: string | null | undefined): TextStyles {
  if (!raw) return defaultTextStyles;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return defaultTextStyles;
  }
  const out = { ...defaultTextStyles };
  if (value && typeof value === "object") {
    for (const key of textStyleKeys) {
      const parsed = textStyleSchema.safeParse((value as Record<string, unknown>)[key]);
      if (parsed.success) out[key] = parsed.data;
    }
  }
  return out;
}

/** The patch that turns a text's element format into the style: unset props are cleared. */
export function stylePatch(style: TextStyle): Partial<TextFormat> {
  const patch: Partial<TextFormat> = { bold: undefined };
  for (const prop of styleProps) (patch as Record<string, unknown>)[prop] = style[prop];
  return patch;
}

/** Which saved style a format matches exactly, if any (to show it as selected). */
export function matchingStyle(styles: TextStyles, format: TextFormat | undefined): TextStyleKey | null {
  if (!format) return null;
  for (const key of textStyleKeys) {
    const style = styles[key];
    if (styleProps.every((prop) => (style[prop] ?? undefined) === (format[prop] ?? undefined))) return key;
  }
  return null;
}
