import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { LogoInfo } from "@/components/quote-render/model";

/**
 * Brand Kit logos for the PDF. react-pdf cannot draw SVG files, so SVG logos are rasterised
 * here (sharp, librsvg) at print resolution. The average tone of the opaque pixels tells the
 * templates whether the logo needs a contrasting plate on dark or light backgrounds.
 */

const cache = new Map<string, LogoInfo | null>();

export async function prepareLogo(logo: { mime: string; dataBase64: string }): Promise<LogoInfo | null> {
  const key = createHash("sha256").update(logo.mime).update(logo.dataBase64).digest("hex");
  if (cache.has(key)) return cache.get(key) ?? null;
  const result = await analyse(logo).catch(() => null);
  if (cache.size > 50) cache.clear();
  cache.set(key, result);
  return result;
}

async function analyse(logo: { mime: string; dataBase64: string }): Promise<LogoInfo | null> {
  const input = Buffer.from(logo.dataBase64, "base64");
  const svg = logo.mime === "image/svg+xml";
  const image = svg ? sharp(input, { density: 300, limitInputPixels: 40_000_000 }).resize({ width: 1200, withoutEnlargement: false, fit: "inside" }) : sharp(input, { limitInputPixels: 40_000_000 });
  const png = await image.png().toBuffer();
  const { data, info } = await sharp(png).ensureAlpha().resize({ width: 120, fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let weight = 0;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = (data[index + 3] ?? 0) / 255;
    if (alpha < 0.2) continue;
    const r = data[index] ?? 0;
    const g = data[index + 1] ?? 0;
    const b = data[index + 2] ?? 0;
    sum += (0.2126 * r + 0.7152 * g + 0.0722 * b) * alpha;
    weight += alpha;
  }
  const meta = await sharp(png).metadata();
  const aspect = meta.width && meta.height ? meta.width / meta.height : null;
  const opaqueShare = weight / (info.width * info.height);
  // A logo on an opaque rectangle carries its own background: no plate needed.
  const tone = opaqueShare > 0.92 ? null : weight === 0 ? null : sum / weight / 255 > 0.6 ? "light" : "dark";
  const src = svg || logo.mime === "image/png" ? `data:image/png;base64,${png.toString("base64")}` : `data:${logo.mime};base64,${logo.dataBase64}`;
  return { src, tone, aspect };
}
