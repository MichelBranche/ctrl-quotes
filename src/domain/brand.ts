import { z } from "zod";
import { clientInputSchema } from "@/domain/clients";
import { fontFamilyName, isFontRef, type FontRef } from "@/domain/fonts";

/**
 * Brand Kit fonts: "template" (each template keeps its own type) or a library font reference,
 * e.g. "g:Playfair Display" or "fs:satoshi". The old values (Inter, Instrument Serif, Georgia,
 * Sistema) never reached the quotes, so they read as "template": nothing changes for old quotes.
 */
export type BrandFont = "template" | FontRef;

export function asBrandFont(value: string | null | undefined): BrandFont {
  return isFontRef(value) ? value : "template";
}

export function fontStack(value: BrandFont): string {
  return value === "template" ? "inherit" : `"${fontFamilyName(value)}", ui-sans-serif, system-ui, sans-serif`;
}

/** The four names the old Brand Kit offered: still accepted from old clients, saved as "template". */
const legacyFonts = new Set(["Inter", "Instrument Serif", "Georgia", "Sistema"]);

const brandFontSchema = z
  .string()
  .refine((value) => value === "template" || legacyFonts.has(value) || isFontRef(value), { error: "Font non disponibile." })
  .transform((value) => asBrandFont(value));

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, { error: "Usa un colore esadecimale a sei cifre, per esempio #7C3AED." })
  .transform((value) => value.toUpperCase());

const shared = clientInputSchema.shape;

export const brandInputSchema = z.object({
  companyName: z
    .string()
    .trim()
    .max(120, { error: "Il nome azienda può avere al massimo 120 caratteri." })
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .default(null),
  vatNumber: shared.vatNumber,
  taxCode: shared.taxCode,
  address: shared.address,
  email: shared.email,
  phone: shared.phone,
  website: shared.website,
  colorPrimary: hex,
  colorSecondary: hex,
  colorBackground: hex,
  fontHeading: brandFontSchema,
  fontBody: brandFontSchema,
  applyAutomatically: z.boolean().default(true),
});

export type BrandInput = z.infer<typeof brandInputSchema>;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  const raw = color.replace("#", "");
  const r = channel(Number.parseInt(raw.slice(0, 2), 16));
  const g = channel(Number.parseInt(raw.slice(2, 4), 16));
  const b = channel(Number.parseInt(raw.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

/** Text color that stays readable on the given background. */
export function readableOn(background: string): "#FFFFFF" | "#0B0B0F" {
  return contrastRatio("#FFFFFF", background) >= contrastRatio("#0B0B0F", background) ? "#FFFFFF" : "#0B0B0F";
}

export const logoLimits = {
  maxBytes: 1024 * 1024,
  mimes: ["image/png", "image/jpeg", "image/svg+xml"] as const,
};

export type LogoMime = (typeof logoLimits.mimes)[number];

/** Checks magic bytes so the declared type cannot be spoofed. SVG is scanned for active content. */
export function sniffLogo(bytes: Uint8Array): { ok: true; mime: LogoMime } | { ok: false; message: string } {
  if (bytes.length === 0) return { ok: false, message: "Il file è vuoto." };
  if (bytes.length > logoLimits.maxBytes) return { ok: false, message: "Il logo supera 1 MB." };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, index) => bytes[index] === byte)) return { ok: true, mime: "image/png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ok: true, mime: "image/jpeg" };
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, Math.min(bytes.length, 200_000)));
  const trimmed = head.replace(/^\uFEFF/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(trimmed)) {
    if (/<script|<foreignObject|javascript:|\son[a-z]+\s*=|<iframe|<embed|<object|xlink:href\s*=\s*["']?(?!#)/i.test(head)) {
      return { ok: false, message: "L'SVG contiene script o riferimenti esterni. Esportalo di nuovo come immagine semplice." };
    }
    return { ok: true, mime: "image/svg+xml" };
  }
  return { ok: false, message: "Formato non supportato. Usa PNG, JPG o SVG." };
}
