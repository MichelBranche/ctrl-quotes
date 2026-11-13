import { describe, expect, it } from "vitest";
import { buildModel, type Resources, type Section } from "@/components/quote-render/model";
import { canColumn, fitLayout, normalizeColumns, printedWidths, rowOf, unitsOf, validLayout } from "@/domain/columns";
import { applyCommand, type DocumentCommand } from "@/domain/document-ops";
import { computeTotals, documentSchema, newBlock, type QuoteBlock, type QuoteDocument } from "@/domain/quote-document";
import type { QuoteSnapshot } from "@/domain/quote-snapshot";
import { templateKeys } from "@/domain/templates";
import { renderQuotePdf } from "@/server/pdf/quote-pdf";
import { demoSnapshot } from "./fixtures/template-demo";

let n = 0;
const makeId = () => `id${++n}`;

function block(type: Parameters<typeof newBlock>[0], id: string): QuoteBlock {
  return { ...newBlock(type), id } as QuoteBlock;
}

function text(id: string, heading = id, body = "Testo di prova."): QuoteBlock {
  return { ...block("text", id), heading, body } as QuoteBlock;
}

function doc(blocks: QuoteBlock[]): QuoteDocument {
  return documentSchema.parse({ blocks, withholdingBp: 0, style: { accent: "template", photos: {} } });
}

function run(document: QuoteDocument, command: DocumentCommand): QuoteDocument {
  const result = applyCommand(document, command, { makeId, order: "template" });
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

const layout = (document: QuoteDocument) => document.blocks.map((block) => (block.col ? `${block.id}:${block.col.row}:${block.col.span}` : block.id));

function base(): QuoteDocument {
  return doc([block("cover", "cover"), text("a"), text("b"), text("c"), text("d"), block("services", "srv"), block("summary", "sum"), block("contacts", "end")]);
}

describe("modello colonne", () => {
  it("i documenti senza righe restano identici (stesso array)", () => {
    const document = base();
    expect(normalizeColumns(document.blocks)).toBe(document.blocks);
    expect(documentSchema.parse(JSON.parse(JSON.stringify(document)))).toEqual(document);
    expect("col" in (document.blocks[1] as object)).toBe(false);
  });

  it("solo le larghezze ammesse: in sesti, sommano sempre a 6", () => {
    expect(validLayout([3, 3])).toBe(true);
    expect(validLayout([2, 4])).toBe(true);
    expect(validLayout([2, 2, 2])).toBe(true);
    expect(validLayout([2, 2])).toBe(false);
    expect(validLayout([4, 4])).toBe(false);
    expect(validLayout([3, 3, 3])).toBe(false);
    for (const spans of [[2, 2], [4, 4], [2, 3], [3, 4], [4, 2, 2], [2]]) {
      const fitted = fitLayout(spans);
      if (spans.length >= 2) expect(fitted.reduce((sum, span) => sum + span, 0)).toBe(6);
    }
    expect(fitLayout([2, 3])).toEqual([2, 4]);
    expect(fitLayout([4, 3])).toEqual([4, 2]);
  });

  it("normalizza: tipi non ammessi, riga di uno, membri lontani, più di tre colonne", () => {
    const blocks: QuoteBlock[] = [
      { ...block("services", "s1"), col: { row: "r", span: 3 } } as QuoteBlock,
      { ...text("a"), col: { row: "r", span: 3 } },
      { ...text("b"), col: { row: "x", span: 3 } },
      { ...text("c"), col: { row: "x", span: 3 } },
      text("gap"),
      { ...text("d"), col: { row: "x", span: 3 } },
      { ...text("e"), col: { row: "x", span: 3 } },
      { ...text("f"), col: { row: "y", span: 2 } },
      { ...text("g"), col: { row: "y", span: 2 } },
      { ...text("h"), col: { row: "y", span: 2 } },
      { ...text("i"), col: { row: "y", span: 2 } },
    ];
    const out = normalizeColumns(blocks);
    const cols = Object.fromEntries(out.map((block) => [block.id, block.col ?? null]));
    expect(cols.s1).toBeNull();
    expect(cols.a).toBeNull();
    expect(cols.b).toEqual({ row: "x", span: 3 });
    expect(cols.d?.row).toBe("x-2");
    expect(cols.e?.row).toBe("x-2");
    expect([cols.f, cols.g, cols.h].map((col) => col?.span)).toEqual([2, 2, 2]);
    expect(cols.i).toBeNull();
    for (const unit of unitsOf(out)) {
      if (unit.kind === "row") expect(unit.blocks.reduce((sum, block) => sum + (block.col?.span ?? 0), 0)).toBe(6);
    }
  });

  it("affianca, sceglie le larghezze, separa: ogni passo è un comando", () => {
    let document = run(base(), { kind: "joinRow", blockId: "b", targetId: "a", side: "after" });
    expect(layout(document).slice(1, 3)).toEqual(["a:id1:3", "b:id1:3"]);
    document = run(document, { kind: "joinRow", blockId: "d", targetId: "a", side: "before" });
    expect(layout(document).slice(1, 5)).toEqual(["d:id1:2", "a:id1:2", "b:id1:2", "c"]);
    expect(applyCommand(document, { kind: "joinRow", blockId: "c", targetId: "a", side: "after" }).ok).toBe(false);
    expect(applyCommand(document, { kind: "setRowLayout", row: "id1", spans: [4, 2] }).ok).toBe(false);
    document = run(document, { kind: "leaveRow", blockId: "a" });
    expect(layout(document).slice(1, 5)).toEqual(["d:id1:3", "b:id1:3", "a", "c"]);
    document = run(document, { kind: "setRowLayout", row: "id1", spans: [2, 4] });
    expect(layout(document).slice(1, 3)).toEqual(["d:id1:2", "b:id1:4"]);
    document = run(document, { kind: "splitRow", row: "id1" });
    expect(document.blocks.some((block) => block.col)).toBe(false);
  });

  it("le tabelle, il Riepilogo e la firma restano a piena larghezza", () => {
    expect(canColumn("services")).toBe(false);
    expect(canColumn("summary")).toBe(false);
    expect(canColumn("contacts")).toBe(false);
    expect(canColumn("chartCosts")).toBe(true);
    expect(applyCommand(base(), { kind: "joinRow", blockId: "srv", targetId: "d", side: "after" }).ok).toBe(false);
    expect(applyCommand(base(), { kind: "joinRow", blockId: "a", targetId: "a", side: "after" }).ok).toBe(false);
  });

  it("eliminare o spostare una colonna rompe la riga in modo pulito", () => {
    let document = run(base(), { kind: "joinRow", blockId: "b", targetId: "a", side: "after" });
    document = run(document, { kind: "joinRow", blockId: "c", targetId: "b", side: "after" });
    const removed = run(document, { kind: "removeBlock", blockId: "b" });
    expect(layout(removed).slice(1, 3)).toEqual(["a:id2:3", "c:id2:3"]);
    const alone = run(removed, { kind: "removeBlock", blockId: "c" });
    expect(alone.blocks.find((block) => block.id === "a")?.col).toBeUndefined();
    // Dragging one column away (a plain reorder) takes it out of the row.
    const ids = document.blocks.map((block) => block.id).filter((id) => id !== "a");
    ids.splice(ids.indexOf("d") + 1, 0, "a");
    const moved = run(document, { kind: "reorderBlocks", ids });
    expect(moved.blocks.find((block) => block.id === "a")?.col).toBeUndefined();
    expect(rowOf(moved.blocks, "b")?.blocks.map((block) => block.col?.span)).toEqual([3, 3]);
    // A block dropped in the middle splits the row in two halves; halves of one go full width.
    const split = run(document, { kind: "moveBlock", blockId: "d", toIndex: 2 });
    expect(split.blocks.filter((block) => block.col)).toHaveLength(2);
  });

  it("sposta la riga intera e duplica dentro la riga", () => {
    let document = run(base(), { kind: "joinRow", blockId: "c", targetId: "b", side: "after" });
    document = run(document, { kind: "moveUnit", blockId: "c", delta: -1 });
    expect(layout(document).slice(1, 4)).toEqual(["b:id3:3", "c:id3:3", "a"]);
    // A full width block hops over the whole row.
    document = run(document, { kind: "moveUnit", blockId: "a", delta: -1 });
    expect(layout(document).slice(1, 4)).toEqual(["a", "b:id3:3", "c:id3:3"]);
    const copy = run(document, { kind: "duplicateBlock", blockId: "b" });
    expect(rowOf(copy.blocks, "b")?.blocks).toHaveLength(3);
    const full = run(copy, { kind: "duplicateBlock", blockId: "c" });
    expect(rowOf(full.blocks, "c")?.blocks).toHaveLength(3);
    expect(full.blocks.filter((block) => !block.col && block.type === "text")).toHaveLength(3);
  });

  it("inserisce un blocco nuovo accanto in un solo passo, anche un grafico", () => {
    const chart = block("chartCosts", "chart");
    const document = run(base(), { kind: "insertBeside", block: chart, targetId: "a", side: "after" });
    const row = document.blocks[1]?.col?.row;
    expect(layout(document).slice(1, 3)).toEqual([`a:${row}:3`, `chart:${row}:3`]);
  });

  it("annulla e ripeti: lo stato precedente è intatto (comandi puri)", () => {
    const before = base();
    const snapshot = JSON.stringify(before);
    run(before, { kind: "joinRow", blockId: "b", targetId: "a", side: "after" });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

const resources = (placeholders = false): Resources => ({ image: () => null, photo: () => null, logo: null, watermark: null, versionLabel: null, placeholders });

function snapshotWith(key: (typeof templateKeys)[number], edit: (blocks: QuoteBlock[]) => QuoteBlock[]): QuoteSnapshot {
  const snapshot = demoSnapshot(key);
  const document = { ...snapshot.document, blocks: edit(snapshot.document.blocks) };
  return { ...snapshot, document, totals: computeTotals(document, snapshot.fiscal) };
}

/** A chart next to the intro text, and a row of three after the services. */
function withRows(blocks: QuoteBlock[]): QuoteBlock[] {
  const out: QuoteBlock[] = [];
  for (const entry of blocks) {
    out.push(entry);
    if (entry.type === "services") {
      out.push({ ...text("t1", "Metodo", "Lavoriamo in tre fasi brevi: ascolto, progetto e messa online."), col: { row: "r1", span: 4 } });
      out.push({ ...block("chartCosts", "c1"), col: { row: "r1", span: 2 } } as QuoteBlock);
      out.push({ ...text("t2", "Ascolto", "Un incontro per capire obiettivi e pubblico."), col: { row: "r2", span: 2 } });
      out.push({ ...text("t3", "Progetto", "Struttura, contenuti e design delle pagine."), col: { row: "r2", span: 2 } });
      out.push({ ...block("chartPayments", "c2"), col: { row: "r2", span: 2 } } as QuoteBlock);
    }
  }
  return out;
}

const rowsOf = (sections: Section[]) => sections.filter((section): section is Extract<Section, { kind: "row" }> => section.kind === "row");

describe("righe nel documento stampato", () => {
  it("buildModel raggruppa le colonne, numera da sinistra a destra, larghezze in percento", () => {
    const model = buildModel(snapshotWith("minimal", withRows), resources(), "fromIntro");
    const rows = rowsOf(model.pages.flat());
    expect(rows).toHaveLength(2);
    expect(rows[0]?.columns.map((column) => [column.section.id, column.width])).toEqual([
      ["t1", 66.67],
      ["c1", 33.33],
    ]);
    const numbers = rows[1]?.columns.map((column) => column.section.no) ?? [];
    expect(numbers[1]).toBe((numbers[0] ?? 0) + 1);
    expect(numbers[2]).toBe((numbers[1] ?? 0) + 1);
  });

  it("una colonna nascosta esce e le altre si allargano; se ne resta una va a piena larghezza", () => {
    const hidden = snapshotWith("minimal", (blocks) => withRows(blocks).map((block) => (block.id === "t3" ? { ...block, visible: false } : block)));
    const row = rowsOf(buildModel(hidden, resources(), "fromIntro").pages.flat())[1];
    expect(row?.columns.map((column) => column.width)).toEqual([50, 50]);
    const single = snapshotWith("minimal", (blocks) => withRows(blocks).map((block) => (block.id === "c1" ? { ...block, visible: false } : block)));
    const sections = buildModel(single, resources(), "fromIntro").pages.flat();
    expect(rowsOf(sections)).toHaveLength(1);
    expect(sections.some((section) => section.id === "t1")).toBe(true);
    expect(printedWidths([2, 4])).toEqual([33.33, 66.67]);
  });

  it("il PDF stampa le righe in tutti e cinque i template", async () => {
    for (const key of templateKeys) {
      const pdf = await renderQuotePdf(snapshotWith(key, withRows), { images: new Map(), watermark: null });
      expect(pdf.length).toBeGreaterThan(10_000);
      const plain = await renderQuotePdf(demoSnapshot(key), { images: new Map(), watermark: null });
      expect(pdf.length).toBeGreaterThan(plain.length);
    }
  }, 120_000);
});
