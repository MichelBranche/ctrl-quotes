import { createHash } from "node:crypto";
import sharp from "sharp";

export const SIGNATURE_MAX_BYTES = 200_000;
export const SIGNATURE_MIN_WIDTH = 80;
export const SIGNATURE_MIN_HEIGHT = 40;
export const SIGNATURE_MAX_WIDTH = 2000;
export const SIGNATURE_MAX_HEIGHT = 800;
const MIN_INK_PIXELS = 80;
const MIN_INK_RATIO = 0.001;

const DATA_URL_RE = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/i;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type ParsedSignature =
  | { ok: true; mime: "image/png"; bytes: Buffer; sha256: string; width: number; height: number }
  | { ok: false; message: string };

function fail(message: string): ParsedSignature {
  return { ok: false, message };
}

/** Accepts a PNG data URL from the signature pad. Rejects empty or oversized strokes. */
export async function parseSignatureDataUrl(raw: unknown): Promise<ParsedSignature> {
  if (typeof raw !== "string" || !raw.trim()) {
    return fail("Per accettare devi firmare il preventivo.");
  }
  const match = raw.trim().match(DATA_URL_RE);
  if (!match?.[1]) {
    return fail("La firma non è in un formato valido. Disegnala di nuovo nel riquadro.");
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(match[1].replace(/\s+/g, ""), "base64");
  } catch {
    return fail("La firma non è in un formato valido. Disegnala di nuovo nel riquadro.");
  }
  if (!bytes.length) return fail("Per accettare devi firmare il preventivo.");
  if (bytes.length > SIGNATURE_MAX_BYTES) {
    return fail("La firma è troppo pesante. Cancella e firmala di nuovo, con un tratto più semplice.");
  }
  if (bytes.length < PNG_MAGIC.length || !bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    return fail("La firma non è in un formato valido. Disegnala di nuovo nel riquadro.");
  }
  return inspectPng(bytes);
}

async function inspectPng(bytes: Buffer): Promise<ParsedSignature> {
  try {
    const image = sharp(bytes, { failOn: "error" });
    const meta = await image.metadata();
    if (meta.format !== "png") {
      return fail("La firma non è in un formato valido. Disegnala di nuovo nel riquadro.");
    }
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < SIGNATURE_MIN_WIDTH || height < SIGNATURE_MIN_HEIGHT) {
      return fail("Per accettare devi firmare il preventivo.");
    }
    if (width > SIGNATURE_MAX_WIDTH || height > SIGNATURE_MAX_HEIGHT) {
      return fail("La firma non è in un formato valido. Disegnala di nuovo nel riquadro.");
    }
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let ink = 0;
    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3] ?? 0;
      if (alpha < 24) continue;
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;
      if (red > 245 && green > 245 && blue > 245) continue;
      ink += 1;
    }
    const minInk = Math.max(MIN_INK_PIXELS, Math.round(info.width * info.height * MIN_INK_RATIO));
    if (ink < minInk) {
      return fail("Per accettare devi firmare il preventivo: disegna la firma nel riquadro.");
    }
    return {
      ok: true,
      mime: "image/png",
      bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      width,
      height,
    };
  } catch {
    return fail("La firma non è in un formato valido. Disegnala di nuovo nel riquadro.");
  }
}

export function signatureDataUrl(bytes: Buffer, mime = "image/png"): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
