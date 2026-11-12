import { describe, expect, it } from "vitest";
import { fieldLimit, getField, setField, type FieldPath } from "@/domain/document-ops";
import { blockSchema, type QuoteBlock } from "@/domain/quote-document";
import { outlineGroups } from "@/components/quote-editor/visuale/outline";
import { demoDocument } from "./fixtures/template-demo";

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
  const pageOf = new Map<string, number>(blocks.map((block, index) => [block.id, index < 1 ? 0 : index < 3 ? 1 : 2]));

  it("raggruppa i blocchi per pagina stampata", () => {
    const groups = outlineGroups(blocks, pageOf, null);
    expect(groups.map((group) => group.label)).toEqual(["Pagina 1", "Pagina 2", "Pagina 3"]);
    expect(groups.flatMap((group) => group.blocks)).toEqual(blocks);
  });

  it("segna la pagina che inizia dal Riepilogo", () => {
    const summary = blocks[3];
    if (!summary) throw new Error("demo troppo corta");
    const groups = outlineGroups(blocks, pageOf, summary.id);
    expect(groups[2]?.label).toBe("Pagina 3 · dal Riepilogo");
  });

  it("un blocco nascosto resta con quello prima", () => {
    const hidden = new Map(pageOf);
    const second = blocks[1];
    if (!second) throw new Error("demo troppo corta");
    hidden.set(second.id, -1);
    const groups = outlineGroups(blocks, hidden, null);
    expect(groups[0]?.blocks.map((block) => block.id)).toContain(second.id);
  });

  it("il blocco trascinato appare sulla pagina dove si apre lo spazio", () => {
    const moving = blocks[blocks.length - 1];
    if (!moving) throw new Error("demo troppo corta");
    const order = [blocks[0], moving, ...blocks.slice(1, -1)].filter((block): block is QuoteBlock => Boolean(block));
    const groups = outlineGroups(order, pageOf, null, moving.id);
    const page = groups.find((group) => group.blocks.some((block) => block.id === moving.id));
    expect(page?.label).toBe("Pagina 2");
  });
});
