import "server-only";
import { Font } from "@react-pdf/renderer";
import { findFont } from "@/domain/fonts/catalog";
import { fontFamilyName, nearest, parseFaces, upstreamCssUrl, type FontFace, type FontRef } from "@/domain/fonts";

/**
 * Library fonts in the PDF. The upstream sheet is asked for TTF (Google answers TTF to a client
 * without a browser user agent; Fontshare lists TTF next to WOFF2), each family is registered
 * once per server instance and react-pdf keeps the loaded files in memory. A family that cannot
 * be reached is simply not usable: the text keeps the template font and the PDF still renders.
 */

const sheets = new Map<FontRef, Promise<FontFace[] | null>>();
const registered = new Set<FontRef>();

async function facesOf(ref: FontRef): Promise<FontFace[] | null> {
  const entry = findFont(ref);
  if (!entry) return null;
  let hit = sheets.get(ref);
  if (!hit) {
    hit = (async () => {
      try {
        const response = await fetch(upstreamCssUrl(entry), { headers: { "user-agent": "ctrl-quotes-pdf" }, signal: AbortSignal.timeout(6000) });
        if (!response.ok) return null;
        const faces = parseFaces(await response.text()).filter((face) => face.format === "truetype" || face.format === "woff");
        return faces.length ? faces : null;
      } catch {
        return null;
      }
    })();
    sheets.set(ref, hit);
    // A failed lookup is retried on a later PDF, not cached forever.
    void hit.then((faces) => {
      if (!faces) sheets.delete(ref);
    });
  }
  return hit;
}

function pickFace(faces: FontFace[], weight: number, italic: boolean): FontFace | null {
  const same = faces.filter((face) => face.italic === italic && !face.range);
  const pool = same.length ? same : faces.filter((face) => face.italic === italic);
  const sorted = pool.filter((face) => face.weight === weight);
  // TTF first: react-pdf reads both, TTF is the reference file.
  return sorted.find((face) => face.format === "truetype") ?? sorted[0] ?? null;
}

/** Registers the families and returns the ones the PDF can use. */
export async function prepareLibraryFonts(refs: readonly FontRef[]): Promise<Set<FontRef>> {
  const usable = new Set<FontRef>();
  await Promise.all(
    [...new Set(refs)].slice(0, 12).map(async (ref) => {
      if (registered.has(ref)) {
        usable.add(ref);
        return;
      }
      const faces = await facesOf(ref);
      if (!faces) return;
      const uprights = [...new Set(faces.filter((face) => !face.italic).map((face) => face.weight))];
      const italics = [...new Set(faces.filter((face) => face.italic).map((face) => face.weight))];
      if (!uprights.length) return;
      const sources: Array<{ src: string; fontWeight: number; fontStyle?: "italic" }> = [];
      for (const weight of uprights) {
        const face = pickFace(faces, weight, false);
        if (face) sources.push({ src: face.url, fontWeight: weight });
      }
      // Every weight also gets an italic: the real one when the family has it, else the upright,
      // so an italic word never makes the PDF fail.
      for (const weight of uprights) {
        const real = italics.length ? pickFace(faces, nearest(italics, weight), true) : null;
        const face = real ?? pickFace(faces, weight, false);
        if (face) sources.push({ src: face.url, fontWeight: weight, fontStyle: "italic" });
      }
      Font.register({ family: fontFamilyName(ref), fonts: sources });
      registered.add(ref);
      usable.add(ref);
    }),
  );
  return usable;
}
