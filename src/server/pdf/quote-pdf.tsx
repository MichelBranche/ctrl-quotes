import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { Document, Font, renderToBuffer } from "@react-pdf/renderer";
import { buildModel, type LogoInfo, type Resources } from "@/components/quote-render/model";
import { renderers } from "@/components/quote-render/templates";
import type { QuoteSnapshot } from "@/domain/quote-snapshot";
import { emptyPlan, improves, nextStep, pageEdges, readPages, tallTags, withTall, type LayoutNode, type PrintPage, type PrintPlan } from "./fit";
import { pdfKit } from "./kit-pdf";
import { prepareLibraryFonts } from "./library-fonts";
import { brandFontRef, formatContext, withFormats } from "@/components/quote-render/format";
import { fontsInFormats } from "@/domain/text-format";
import type { FontRef } from "@/domain/fonts";
import type { Kit } from "@/components/quote-render/kit";
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
    fonts: [
      ...[300, 400, 500, 600, 700, 800, 900].map((weight) => ({ src: path.join(fontDir, `inter-latin-${weight}-normal.woff`), fontWeight: weight })),
      // Italic words (editor formatting) need an italic face, or react-pdf refuses the text.
      { src: path.join(fontDir, "inter-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" as const },
      { src: path.join(fontDir, "inter-latin-700-italic.woff"), fontWeight: 700, fontStyle: "italic" as const },
    ],
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
  Font.register({
    family: "CQFigures",
    fonts: [
      { src: path.join(fontDir, "instrument-serif-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(fontDir, "instrument-serif-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
    ],
  });
  // Archivo Black has no italic: the upright stands in, so formatting never breaks the PDF.
  Font.register({
    family: "CQArchivo",
    fonts: [
      { src: path.join(fontDir, "archivo-black-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(fontDir, "archivo-black-latin-400-normal.woff"), fontWeight: 400, fontStyle: "italic" },
    ],
  });
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
  return (await renderQuotePdfPlan(snapshot, options)).buffer;
}

/** The PDF and the print plan the pagination pass settled on (tests and QA read the plan). */
export async function renderQuotePdfPlan(snapshot: QuoteSnapshot, options: PdfOptions): Promise<{ buffer: Buffer; plan: PrintPlan; pages: PrintPage[] }> {
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
  const wanted = [
    ...fontsInFormats(snapshot.document.blocks.map((block) => block.fmt)),
    ...[brandFontRef(snapshot.brand.fontHeading), brandFontRef(snapshot.brand.fontBody)].filter((ref): ref is FontRef => ref !== null),
  ];
  const usable = wanted.length ? await prepareLibraryFonts(wanted) : new Set<FontRef>();
  let kit: Kit = withFormats(pdfKit, formatContext(snapshot.document, snapshot.brand, (ref) => usable.has(ref)));
  const title = [snapshot.quote.number, snapshot.quote.title].filter(Boolean).join(" · ");
  const pass = async (plan: PrintPlan): Promise<Pass> => {
    const model = buildModel(snapshot, resources, renderer.numbering, plan);
    let layout: LayoutNode | null = null;
    // onRender hands back the laid out pages: where every element landed, used by the fit pass.
    const onRender = (result: { _INTERNAL__LAYOUT__DATA_?: LayoutNode }) => {
      layout = result._INTERNAL__LAYOUT__DATA_ ?? null;
    };
    const doc = (
      <Document title={title} author={snapshot.issuer.displayName} subject="Preventivo" creator="CTRL Quotes" producer="CTRL Quotes" language="it-IT" onRender={onRender as never}>
        {renderer.render(kit, model)}
      </Document>
    );
    const watch = { overflow: false };
    try {
      const buffer = await overflowWatch.run(watch, () => renderToBuffer(doc));
      return { buffer, pages: readPages(layout), overflow: watch.overflow };
    } catch (error) {
      // An element kept whole but taller than a page can make react-pdf fail; the probe handles it.
      if (plan.probe || !watch.overflow) throw error;
      return { buffer: null, pages: [], overflow: true };
    }
  };
  let result: Awaited<ReturnType<typeof fitPages<Pass>>>;
  try {
    result = await fitPages(pass, { edges: renderer.edges === true });
  } catch (error) {
    // A library font that fails to load mid-render: print with the template fonts instead.
    if (!usable.size) throw error;
    kit = withFormats(pdfKit, formatContext(snapshot.document, snapshot.brand, () => false));
    result = await fitPages(pass, { edges: renderer.edges === true });
  }
  if (!result.buffer) throw new Error("PDF non generato");
  return { buffer: result.buffer, plan: result.plan, pages: result.pages };
}

type Pass = { buffer: Buffer | null; pages: PrintPage[]; overflow: boolean };

/**
 * react-pdf reports an element that must stay whole but is taller than a page only with a console
 * warning. The warning is caught for the render that caused it (and only that one) and turned into
 * a probe of the layout.
 */
const overflowWatch = new AsyncLocalStorage<{ overflow: boolean }>();
let watching = false;
function watchOverflow() {
  if (watching) return;
  watching = true;
  const warn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const watch = overflowWatch.getStore();
    if (watch && typeof args[0] === "string" && args[0].includes("can't wrap between pages")) {
      watch.overflow = true;
      return;
    }
    warn(...args);
  };
}

const fit = { minGap: 150, minStart: 110, minSaving: 120, maxRenders: 7 };

/**
 * Renders, reads the pagination, and renders again with a better print plan while it helps
 * (see ./fit.ts). Most documents need a single render.
 */
export async function fitPages<T extends Pass>(render: (plan: PrintPlan) => Promise<T>, options: { edges?: boolean } = {}): Promise<T & { plan: PrintPlan }> {
  watchOverflow();
  let plan = emptyPlan;
  let best = await render(plan);
  let renders = 1;
  if (best.overflow) {
    // Something kept whole does not fit a page: measure everything, then let those pieces break.
    const probe = await render({ ...plan, probe: true });
    plan = withTall(plan, tallTags(probe.pages));
    const fixed = await render(plan);
    renders += 2;
    if (!fixed.buffer || fixed.overflow) return { ...probe, plan: { ...emptyPlan, probe: true } };
    best = fixed;
  }
  const tried = new Set<string>();
  for (; renders < fit.maxRenders; renders += 1) {
    const step = nextStep(plan, best.pages, tried, fit);
    if (!step) break;
    const attempt = await render(step.plan);
    if (step.trial) tried.add(step.trial);
    if (!attempt.buffer || attempt.overflow) continue;
    if (step.trial && !improves(best.pages, attempt.pages, fit.minSaving)) continue;
    plan = step.plan;
    best = attempt;
  }
  // A template that bleeds bands across a break learns where the breaks fell. Its artwork is
  // absolute, so this last render lands everything on the same spot.
  const edges = options.edges ? pageEdges(best.pages) : null;
  if (edges && edges.size) {
    const final = await render({ ...plan, edges });
    if (final.buffer && !final.overflow) return { ...final, plan: { ...plan, edges } };
  }
  return { ...best, plan };
}

export function pdfFilename(snapshot: QuoteSnapshot, versionNo: number | null): string {
  const base = (snapshot.quote.number ?? "preventivo").replace(/[^\w.-]+/g, "-");
  return versionNo ? `${base}-v${versionNo}.pdf` : `${base}-bozza.pdf`;
}
