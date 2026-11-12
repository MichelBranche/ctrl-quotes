import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { webKit } from "@/components/quote-render/kit-web";
import { templateKeys, type TemplateKey } from "@/domain/templates";
import { renderQuotePdf } from "@/server/pdf/quote-pdf";
import { demoServices, demoSnapshot } from "./fixtures/template-demo";
import { fingerprint, pdfFingerprint, webMarkup } from "./helpers/fingerprint";

/**
 * Golden fingerprints taken on main before the editor work (76c6a00). The editor adds anchors to
 * the templates: the PDF and the normal web preview must stay exactly the same.
 * Regenerate only on purpose: UPDATE_GOLDEN=1 npx vitest run tests/render-parity.test.ts
 */
const goldenFile = path.join(__dirname, "fixtures/render-golden.json");
type Golden = Record<string, string>;

function cases(key: TemplateKey) {
  const many = Array.from({ length: 3 }, () => demoServices()).flat();
  return {
    standard: demoSnapshot(key),
    stress: demoSnapshot(key, { services: many, title: "Riprogettazione completa del portale istituzionale e dell'area clienti" }),
  };
}

async function current(): Promise<Golden> {
  const result: Golden = {};
  for (const key of templateKeys) {
    for (const [name, snapshot] of Object.entries(cases(key))) {
      const pdf = await renderQuotePdf(snapshot, { images: new Map(), watermark: "Bozza", versionLabel: "Bozza" });
      result[`pdf:${key}:${name}`] = pdfFingerprint(pdf);
      result[`web:${key}:${name}`] = fingerprint(webMarkup(snapshot, webKit));
    }
  }
  return result;
}

describe("parità di resa", () => {
  it("PDF e anteprima web dei cinque template restano identici", async () => {
    const now = await current();
    if (process.env.UPDATE_GOLDEN === "1") {
      fs.writeFileSync(goldenFile, `${JSON.stringify(now, null, 2)}\n`);
    }
    const golden = JSON.parse(fs.readFileSync(goldenFile, "utf8")) as Golden;
    expect(now).toEqual(golden);
  }, 180_000);

  it("l'impronta del PDF è stabile tra due render", async () => {
    const snapshot = demoSnapshot("editorial");
    const a = await renderQuotePdf(snapshot, { images: new Map(), watermark: null });
    const b = await renderQuotePdf(snapshot, { images: new Map(), watermark: null });
    expect(pdfFingerprint(a)).toBe(pdfFingerprint(b));
  }, 60_000);
});

describe("sensibilità dell'impronta", () => {
  it("cambia se cambia anche solo un titolo", async () => {
    const base = demoSnapshot("minimal");
    const changed = { ...base, document: { ...base.document, blocks: base.document.blocks.map((block) => (block.type === "terms" ? { ...block, heading: "Condizioni generali" } : block)) } };
    const a = await renderQuotePdf(base, { images: new Map(), watermark: null });
    const b = await renderQuotePdf(changed, { images: new Map(), watermark: null });
    expect(pdfFingerprint(a)).not.toBe(pdfFingerprint(b));
    expect(fingerprint(webMarkup(base, webKit))).not.toBe(fingerprint(webMarkup(changed, webKit)));
  }, 60_000);
});
