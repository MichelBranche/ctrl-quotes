import "server-only";
import path from "node:path";
import { Document, Font, renderToBuffer } from "@react-pdf/renderer";
import { buildModel, type LogoInfo, type Resources } from "@/components/quote-render/model";
import { renderers } from "@/components/quote-render/templates";
import type { QuoteSnapshot } from "@/domain/quote-snapshot";
import { pdfKit } from "./kit-pdf";
import { prepareLogo } from "./logo";

/**
 * Print renderer. Vector text with embedded fonts and real page breaks. It runs the very same
 * template source as the web preview through the react-pdf kit.
 */

const fontDir = path.join(process.cwd(), "src/server/pdf/fonts");
const photoDir = path.join(process.cwd(), "src/server/pdf/photos");
let registered = false;

function registerFonts() {
  if (registered) return;
  Font.register({
    family: "CQInter",
    fonts: [300, 400, 500, 600, 700, 800, 900].map((weight) => ({ src: path.join(fontDir, `inter-latin-${weight}-normal.woff`), fontWeight: weight })),
  });
  Font.register({
    family: "CQCormorant",
    fonts: [
      { src: path.join(fontDir, "cormorant-garamond-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(fontDir, "cormorant-garamond-latin-500-normal.woff"), fontWeight: 500 },
      { src: path.join(fontDir, "cormorant-garamond-latin-600-normal.woff"), fontWeight: 600 },
      { src: path.join(fontDir, "cormorant-garamond-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
      { src: path.join(fontDir, "cormorant-garamond-latin-500-italic.woff"), fontWeight: 500, fontStyle: "italic" },
    ],
  });
  // Lining figures for big serif amounts (Cormorant only ships old-style digits).
  Font.register({ family: "CQFigures", fonts: [{ src: path.join(fontDir, "instrument-serif-latin-400-normal.woff"), fontWeight: 400 }] });
  Font.register({ family: "CQArchivo", fonts: [{ src: path.join(fontDir, "archivo-black-latin-400-normal.woff"), fontWeight: 400 }] });
  // Italian text is not hyphenated by the PDF engine: words wrap whole.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

function imageSource(image: { mime: string; data: Buffer } | undefined): string | null {
  if (!image) return null;
  if (image.mime !== "image/png" && image.mime !== "image/jpeg") return null;
  return `data:${image.mime};base64,${image.data.toString("base64")}`;
}

export type PdfOptions = {
  images: Map<string, { mime: string; data: Buffer }>;
  /** Shown on every page of a draft so it is never mistaken for a frozen version. */
  watermark: string | null;
  /** "v3" for a frozen version, null for a draft. */
  versionLabel?: string | null;
};

export async function renderQuotePdf(snapshot: QuoteSnapshot, options: PdfOptions): Promise<Buffer> {
  registerFonts();
  const logo: LogoInfo | null = snapshot.brand.logo ? await prepareLogo(snapshot.brand.logo) : null;
  const resources: Resources = {
    logo,
    photo: (key, option, slot) => (option.vector || !option.slots.includes(slot) ? null : path.join(photoDir, key, `${option.id}-${slot}.jpg`)),
    image: (assetId) => imageSource(options.images.get(assetId)),
    watermark: options.watermark,
    versionLabel: options.versionLabel ?? (options.watermark ? "Bozza" : null),
  };
  const renderer = renderers[snapshot.template] ?? renderers.minimal;
  const model = buildModel(snapshot, resources, renderer.numbering);
  const title = [snapshot.quote.number, snapshot.quote.title].filter(Boolean).join(" · ");
  const doc = (
    <Document title={title} author={snapshot.issuer.displayName} subject="Preventivo" creator="CTRL Quotes" producer="CTRL Quotes" language="it-IT">
      {renderer.render(pdfKit, model)}
    </Document>
  );
  return renderToBuffer(doc);
}

export function pdfFilename(snapshot: QuoteSnapshot, versionNo: number | null): string {
  const base = (snapshot.quote.number ?? "preventivo").replace(/[^\w.-]+/g, "-");
  return versionNo ? `${base}-v${versionNo}.pdf` : `${base}-bozza.pdf`;
}
