import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyCommand, getField } from "@/domain/document-ops";
import type { QuoteBlock, QuoteDocument } from "@/domain/quote-document";
import { renderQuotePdfPlan } from "@/server/pdf/quote-pdf";
import { demoSnapshot } from "./fixtures/template-demo";

/**
 * Real fonts from Google Fonts and Fontshare embedded in the PDF. Needs the network, so it runs
 * only with FONTS_NET=1 (QA before a release): npx cross-env FONTS_NET=1 vitest run tests/pdf-library-fonts.test.ts
 */
function run(document: QuoteDocument, command: Parameters<typeof applyCommand>[1]) {
  const result = applyCommand(document, command, { order: "free" });
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

describe.runIf(process.env.FONTS_NET === "1")("font della libreria nel PDF", () => {
  it("incorpora un font Google e uno Fontshare, con grassetto, corsivo ed evidenziato", async () => {
    const snapshot = demoSnapshot("minimal");
    const title = snapshot.document.blocks.find((block) => typeof getField(block, "title" as never) === "string") as QuoteBlock;
    const text = snapshot.document.blocks.find((block) => block.type === "text" || block.type === "intro") as QuoteBlock | undefined;
    let document = run(snapshot.document, { kind: "setFormat", blockId: title.id, field: "title", format: { font: "g:Playfair Display", italic: true, color: "#7C3AED" } });
    if (text) {
      const field = typeof getField(text, "body" as never) === "string" ? "body" : "lead";
      const value = getField(text, field as never) as string;
      document = run(document, { kind: "setRich", blockId: text.id, field: field as never, value, marks: [{ s: 0, e: Math.min(12, value.length), b: true, h: "#FEF08A" }] });
      document = run(document, { kind: "setFormat", blockId: text.id, field: field as never, format: { ...(document.blocks.find((block) => block.id === text.id)?.fmt?.[field] ?? {}), font: "fs:satoshi", align: "justify" } });
    }
    document = run(document, { kind: "setLook", blockId: title.id, look: { bg: "#F4F2FF", pad: 8, radius: 6 } });
    const options = { images: new Map(), watermark: "Bozza", versionLabel: "Bozza" };
    const { buffer } = await renderQuotePdfPlan({ ...snapshot, brand: { ...snapshot.brand, fontBody: "fs:general-sans" }, document }, options);
    const plain = await renderQuotePdfPlan(snapshot, options);
    const raw = buffer.toString("latin1");
    // Fontshare TTFs carry no PostScript name, so they are counted rather than named.
    const fonts = (pdf: string) => new Set(pdf.match(/\/FontName \/[A-Z]{6}\+\S+/g) ?? []).size;
    expect(raw).toMatch(/PlayfairDisplay-Italic/);
    expect(fonts(raw)).toBeGreaterThanOrEqual(fonts(plain.buffer.toString("latin1")) + 2);
    const out = process.env.PDF_OUT;
    if (out) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, buffer);
    }
  }, 60_000);
});
