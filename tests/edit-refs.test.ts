import { describe, expect, it } from "vitest";
import { editKit } from "@/components/quote-render/kit-edit";
import { getField, type EditKind, type FieldPath } from "@/domain/document-ops";
import type { QuoteBlock } from "@/domain/quote-document";
import type { QuoteSnapshot } from "@/domain/quote-snapshot";
import { templateKeys, type TemplateKey } from "@/domain/templates";
import { demoSnapshot } from "./fixtures/template-demo";
import { webMarkup } from "./helpers/fingerprint";

type Found = { blockId: string; field: string; kind: string };

/** Demo quote with every kind of text filled, so each template prints all its anchors. */
function fullSnapshot(key: TemplateKey): QuoteSnapshot {
  const snapshot = demoSnapshot(key);
  const blocks: QuoteBlock[] = snapshot.document.blocks.map((block) => {
    if (block.type === "cover") return { ...block, tagline: block.tagline || "Design e sviluppo" };
    if (block.type === "intro") return { ...block, points: ["primo obiettivo", "", "terzo obiettivo"], quote: "Una frase in evidenza." };
    if (block.type === "terms") return { ...block, body: "Condizioni generali del servizio." };
    if (block.type === "options") return { ...block, body: "Attività che puoi aggiungere." };
    if (block.type === "summary") return { ...block, body: "Importi validi per 30 giorni." };
    if (block.type === "contacts") return { ...block, body: "Firma per accettazione." };
    return block;
  });
  const at = blocks.findIndex((block) => block.id === "b-services");
  blocks.splice(at, 0, { id: "b-text", visible: true, type: "text", heading: "Il metodo", body: "Lavoriamo per fasi brevi.\n\nOgni fase si chiude con una revisione." });
  return { ...snapshot, document: { ...snapshot.document, blocks } };
}

function anchorsIn(markup: string): Found[] {
  const found: Found[] = [];
  const tag = /<[a-z]+\b[^>]*\sdata-edit-field="[^"]*"[^>]*>/g;
  for (const match of markup.matchAll(tag)) {
    const attr = (name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(match[0])?.[1] ?? "";
    found.push({ blockId: attr("data-edit-block"), field: attr("data-edit-field"), kind: attr("data-edit-kind") });
  }
  return found;
}

const expectedKind = (field: string): EditKind[] => {
  if (field.endsWith(".unitPriceCents")) return ["money"];
  if (field.endsWith(".quantityMilli")) return ["quantity"];
  return ["line", "multiline"];
};

describe("ancore di modifica", () => {
  for (const key of templateKeys) {
    it(`${key}: ogni ancora punta a un campo esistente e i campi chiave sono modificabili`, () => {
      const snapshot = fullSnapshot(key);
      const blocks = new Map(snapshot.document.blocks.map((block) => [block.id, block]));
      const anchors = anchorsIn(webMarkup(snapshot, editKit));
      expect(anchors.length).toBeGreaterThan(30);

      for (const anchor of anchors) {
        const block = blocks.get(anchor.blockId);
        expect(block, `blocco ${anchor.blockId}`).toBeDefined();
        expect(getField(block!, anchor.field as FieldPath), `${anchor.blockId} ${anchor.field}`).not.toBeUndefined();
        expect(expectedKind(anchor.field)).toContain(anchor.kind);
      }

      const has = (blockId: string, field: string) => anchors.some((anchor) => anchor.blockId === blockId && anchor.field === field);
      const missing: string[] = [];
      const need = (blockId: string, field: string) => (has(blockId, field) ? null : missing.push(`${blockId} ${field}`));

      need("b-cover", "title");
      need("b-cover", "subtitle");
      // Editorial has no tagline on its cover.
      if (key !== "editorial") need("b-cover", "tagline");
      need("b-intro", "body");
      need("b-intro", "points.0");
      need("b-intro", "points.2");
      need("b-intro", "quote");
      need("b-text", "heading");
      need("b-text", "body");
      // Highlights print their items only: the heading is not on the page.
      for (const id of ["b-services", "b-options", "b-summary", "b-timeline", "b-terms", "b-contacts"]) need(id, "heading");
      for (const id of ["b-options", "b-summary", "b-contacts"]) need(id, "body");
      const services = blocks.get("b-services");
      if (services?.type !== "services") throw new Error("servizi");
      for (const line of services.items) {
        for (const field of ["name", "description", "quantityMilli", "unitPriceCents"]) need("b-services", `items.${line.id}.${field}`);
      }
      const options = blocks.get("b-options");
      if (options?.type !== "options") throw new Error("opzioni");
      // Options show the computed amount, not an editable unit price.
      for (const line of options.items) for (const field of ["name", "description"]) need("b-options", `items.${line.id}.${field}`);
      const highlights = blocks.get("b-high");
      if (highlights?.type !== "highlights") throw new Error("vantaggi");
      for (const item of highlights.items) for (const field of ["title", "body"]) need("b-high", `items.${item.id}.${field}`);
      for (const step of ["s1", "s2", "s3", "s4"]) for (const field of ["label", "title"]) need("b-timeline", `steps.${step}.${field}`);
      for (const field of ["payment", "notes", "body"]) need("b-terms", field);
      // The intro heading is printed by every template except Bold, which shows the lead in its place.
      need("b-intro", key === "bold" ? "lead" : "heading");

      expect(missing).toEqual([]);
    });
  }

  it("il punto vuoto saltato dal modello non sposta gli indici", () => {
    const anchors = anchorsIn(webMarkup(fullSnapshot("studio"), editKit));
    const points = anchors.filter((anchor) => anchor.blockId === "b-intro" && anchor.field.startsWith("points.")).map((anchor) => anchor.field);
    expect(points).toEqual(["points.0", "points.2"]);
  });
});
