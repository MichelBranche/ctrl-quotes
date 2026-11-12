import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildModel, computeBreakdown, ensureContrast, normalizeSnapshot } from "@/components/quote-render/model";
import { contrastRatio } from "@/domain/brand";
import { templateKeys } from "@/domain/templates";
import { renderQuotePdf } from "@/server/pdf/quote-pdf";
import { demoServices, demoSnapshot } from "./fixtures/template-demo";

const out = process.env.QA_PDF_DIR;

function pages(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

describe("template premium", () => {
  it("rende i cinque template in PDF A4 con copertina e pagine interne", async () => {
    for (const key of templateKeys) {
      const pdf = await renderQuotePdf(demoSnapshot(key), { images: new Map(), watermark: null, versionLabel: "v1.0" });
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pages(pdf)).toBeGreaterThanOrEqual(3);
      if (out) {
        fs.mkdirSync(out, { recursive: true });
        fs.writeFileSync(path.join(out, `${key}.pdf`), pdf);
      }
    }
  }, 120_000);

  it("regge 18 voci, titolo lungo e un logo SVG", async () => {
    const many = Array.from({ length: 3 }, () => demoServices()).flat();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect width="40" height="40" fill="#111"/><text x="48" y="28" font-size="22" fill="#111">Logo</text></svg>').toString("base64");
    for (const key of templateKeys) {
      const snapshot = demoSnapshot(key, { services: many, title: "Riprogettazione completa del portale istituzionale e dell'area clienti", logo: { mime: "image/svg+xml", dataBase64: svg } });
      const pdf = await renderQuotePdf(snapshot, { images: new Map(), watermark: "Bozza" });
      expect(pages(pdf)).toBeGreaterThanOrEqual(4);
      if (out) fs.writeFileSync(path.join(out, `${key}-stress.pdf`), pdf);
    }
  }, 120_000);

  it("calcola il grafico dei costi dagli importi reali", () => {
    const breakdown = computeBreakdown(demoSnapshot("corporate"));
    expect(breakdown.map((item) => item.percent)).toEqual(["49%", "23%", "12%", "9%", "6%"]);
    expect(breakdown.reduce((sum, item) => sum + item.cents, 0)).toBe(650_000);
  });

  it("tiene le opzioni fuori dal totale e separa una tantum e canone", () => {
    const model = buildModel(demoSnapshot("bold"), { logo: null, photo: () => null, image: () => null, watermark: null, versionLabel: null }, "fromIntro");
    const summary = model.pages.flat().find((section) => section.kind === "summary");
    expect(summary && summary.kind === "summary" ? summary.groups.map((group) => group.total) : []).toEqual(["€ 7.930,00", "€ 183,00"]);
  });

  it("porta un accento personalizzato a un contrasto leggibile", () => {
    const fixed = ensureContrast("#FFE066", "#FFFFFF");
    expect(contrastRatio(fixed, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("legge versioni salvate prima dei nuovi campi", () => {
    const snapshot = demoSnapshot("minimal");
    const legacy = {
      ...snapshot,
      template: "minimal" as const,
      document: { withholdingBp: 0, blocks: [{ id: "c", type: "cover", visible: true, title: "Vecchio", subtitle: "", imageAssetId: null }, { id: "t", type: "terms", visible: true, heading: "Condizioni", body: "Pagamento a 30 giorni." }] },
    } as unknown as typeof snapshot;
    const normalized = normalizeSnapshot(legacy);
    expect(normalized.document.style.accent).toBe("template");
    const model = buildModel(legacy, { logo: null, photo: () => null, image: () => null, watermark: null, versionLabel: null }, "fromCover");
    expect(model.pages.flat()[0]).toMatchObject({ kind: "terms" });
  });
});
