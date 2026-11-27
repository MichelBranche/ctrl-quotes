import sharp from "sharp";
import { signatureDataUrl } from "@/domain/signature";

/** A PNG data URL with a visible dark stroke, valid as a signature. */
export async function inkedSignature(): Promise<string> {
  const width = 320;
  const height = 120;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <path d="M20 80 C 80 20, 140 20, 180 70 S 260 110, 300 40" fill="none" stroke="#111" stroke-width="6" stroke-linecap="round"/>
  </svg>`;
  const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
  return signatureDataUrl(bytes);
}

/** A fully transparent PNG data URL, rejected as an empty signature. */
export async function blankSignature(): Promise<string> {
  const bytes = await sharp({
    create: { width: 320, height: 120, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
  return signatureDataUrl(bytes);
}
