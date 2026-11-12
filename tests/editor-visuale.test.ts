import { describe, expect, it } from "vitest";
import { applyCommand, fieldLimit, getField, lockedMessage, setField, type FieldPath } from "@/domain/document-ops";
import { blockLabel, blockSchema, blockTypes, documentSchema, singletonBlocks, starterBlock, type QuoteBlock } from "@/domain/quote-document";
import { buildModel, type Resources } from "@/components/quote-render/model";
import { outlineGroups } from "@/components/quote-editor/visuale/outline";
import { demoDocument, demoSnapshot } from "./fixtures/template-demo";

const demo = demoDocument("minimal");

/** Every text field a block has, as the sheet addresses it. */
function textFields(block: QuoteBlock): FieldPath[] {
  const fields: string[] = [];
  const record = block as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string" && key !== "id" && key !== "type") fields.push(key);
    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        if (typeof entry === "string") fields.push(`${key}.${index}`);
        else if (entry && typeof entry === "object") {
          const row = entry as Record<string, unknown>;
          for (const [inner, text] of Object.entries(row)) if (typeof text === "string" && inner !== "id") fields.push(`${key}.${String(row.id ?? index)}.${inner}`);
        }
      });
    }
  }
  return fields.filter((field) => typeof getField(block, field as FieldPath) === "string") as FieldPath[];
}

describe("limiti dei campi scritti sul foglio", () => {
  const checked: string[] = [];
  for (const block of demo.blocks) {
    for (const field of textFields(block)) {
      const limit = fieldLimit(block, field);
      if (limit === null) continue;
      checked.push(`${block.type}:${field.replace(/\.[0-9a-f-]{8,}\./, ".*.")}`);
      it(`${block.type} ${field}: ${limit} caratteri passano, uno in più no`, () => {
        const atLimit = setField(block, field, "x".repeat(limit));
        expect(atLimit.ok).toBe(true);
        if (atLimit.ok) expect(blockSchema.safeParse(atLimit.value).success).toBe(true);
        const over = setField(block, field, "x".repeat(limit + 1));
        const refused = !over.ok || !blockSchema.safeParse(over.value).success;
        expect(refused).toBe(true);
      });
    }
  }
  it("copre i campi principali", () => {
    expect(checked.length).toBeGreaterThan(10);
  });
});

describe("struttura per pagine", () => {
  const blocks = demo.blocks;
  const summaryAt = blocks.findIndex((block) => block.type === "summary");
  const hide = (list: QuoteBlock[], id: string) => list.map((block) => (block.id === id ? { ...block, visible: false } : block));
  const where = (groups: ReturnType<typeof outlineGroups>, id: string) => groups.find((group) => group.blocks.some((block) => block.id === id))?.label;

  it("copertina, contenuto e Riepilogo in pagine separate", () => {
    expect(summaryAt).toBeGreaterThan(1);
    const groups = outlineGroups(blocks);
    expect(groups.map((group) => group.label)).toEqual(["Pagina 1", "Pagina 2", "Pagina 3 · dal Riepilogo"]);
    expect(groups.flatMap((group) => group.blocks)).toEqual(blocks);
  });

  it("un blocco nascosto resta sulla sua pagina, e riattivato torna identico", () => {
    const target = blocks[summaryAt + 1] ?? blocks[summaryAt - 1];
    if (!target) throw new Error("demo troppo corta");
    const before = where(outlineGroups(blocks), target.id);
    const hidden = outlineGroups(hide(blocks, target.id));
    expect(where(hidden, target.id)).toBe(before);
    expect(hidden.flatMap((group) => group.blocks).map((block) => block.id)).toEqual(blocks.map((block) => block.id));
    expect(outlineGroups(blocks)).toEqual(outlineGroups(hide(blocks, target.id)).map((group) => ({ ...group, blocks: group.blocks.map((block) => blocks.find((entry) => entry.id === block.id) ?? block) })));
  });

  it("con il Riepilogo nascosto, quel che segue stampa sulla pagina del contenuto", () => {
    const summary = blocks[summaryAt];
    if (!summary) throw new Error("demo senza Riepilogo");
    const groups = outlineGroups(hide(blocks, summary.id));
    expect(groups.map((group) => group.label)).toEqual(["Pagina 1", "Pagina 2", "Pagina 2"]);
  });

  it("una pagina tutta nascosta lo dice", () => {
    const content = blocks.slice(1, summaryAt);
    const list = content.reduce((acc, block) => hide(acc, block.id), blocks);
    const groups = outlineGroups(list);
    expect(groups[1]?.label).toBe("Nascosti, non in stampa");
    expect(groups[2]?.label).toBe("Pagina 2 · dal Riepilogo");
  });
});

describe("blocchi bloccati", () => {
  const intro = demo.blocks.find((block) => block.type === "intro");
  if (!intro) throw new Error("demo senza introduzione");
  const locked = applyCommand(demo, { kind: "lockBlock", blockId: intro.id, locked: true });
  if (!locked.ok) throw new Error(locked.message);
  const doc = locked.value;

  it("lo schema accetta il lucchetto e lo toglie quando sblocchi", () => {
    expect(doc.blocks.find((block) => block.id === intro.id)?.locked).toBe(true);
    expect(documentSchema.safeParse(doc).success).toBe(true);
    const open = applyCommand(doc, { kind: "lockBlock", blockId: intro.id, locked: false });
    expect(open.ok && "locked" in (open.value.blocks.find((block) => block.id === intro.id) ?? {})).toBe(false);
  });

  it("rifiuta testo, sostituzione ed eliminazione", () => {
    const edit = applyCommand(doc, { kind: "setField", blockId: intro.id, field: "heading" as FieldPath, value: "Altro" });
    expect(edit.ok).toBe(false);
    if (!edit.ok) expect(edit.message).toBe(lockedMessage);
    const replace = applyCommand(doc, { kind: "replaceBlock", block: { ...intro, heading: "Altro" } });
    expect(replace.ok).toBe(false);
    expect(applyCommand(doc, { kind: "removeBlock", blockId: intro.id }).ok).toBe(false);
  });

  it("si può ancora spostare, nascondere e duplicare; la copia parte sbloccata", () => {
    const ids = doc.blocks.map((block) => block.id);
    const at = ids.indexOf(intro.id);
    const moved = [...ids];
    moved.splice(at, 1);
    moved.splice(at + 1, 0, intro.id);
    expect(applyCommand(doc, { kind: "reorderBlocks", ids: moved }).ok).toBe(true);
    expect(applyCommand(doc, { kind: "toggleBlock", blockId: intro.id }).ok).toBe(true);
    const copy = applyCommand(doc, { kind: "duplicateBlock", blockId: intro.id });
    expect(copy.ok).toBe(true);
    if (copy.ok) expect(copy.value.blocks.filter((block) => block.type === "intro").map((block) => Boolean(block.locked))).toEqual([true, false]);
  });
});

describe("blocchi nuovi dal menu", () => {
  const resources: Resources = { logo: null, photo: () => null, image: () => "", watermark: null, versionLabel: null };
  const base = demoSnapshot("minimal");
  const defaults = { terms: null, taxRateBp: 2200, priceMode: "net" as const };
  for (const type of blockTypes.filter((entry) => entry !== "cover")) {
    it(`${blockLabel[type]} appare subito sul foglio`, () => {
      const block = starterBlock(type, defaults);
      expect(blockSchema.safeParse(block).success).toBe(true);
      // A singleton replaces the demo's own, as the menu only offers it when missing.
      const others = base.document.blocks.filter((entry) => !(singletonBlocks.has(type) && entry.type === type));
      const snapshot = { ...base, document: { ...base.document, blocks: [...others, block] } };
      const model = buildModel(snapshot, resources, "fromCover");
      expect(model.pages.flat().some((section) => section.id === block.id)).toBe(true);
    });
  }
});
