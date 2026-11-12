import { describe, expect, it } from "vitest";
import { applyCommand, documentProblem, getField, insertionIndex, setField, type DocumentCommand } from "@/domain/document-ops";
import { newBlock, type QuoteBlock, type QuoteDocument } from "@/domain/quote-document";
import { demoDocument } from "./fixtures/template-demo";

function counter() {
  let n = 0;
  return () => `new-${++n}`;
}

function apply(document: QuoteDocument, command: DocumentCommand, order: "free" | "template" = "free") {
  return applyCommand(document, command, { makeId: counter(), order });
}

function ok(document: QuoteDocument, command: DocumentCommand, order: "free" | "template" = "free"): QuoteDocument {
  const result = apply(document, command, order);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

function block<T extends QuoteBlock["type"]>(document: QuoteDocument, type: T): Extract<QuoteBlock, { type: T }> {
  const found = document.blocks.find((entry) => entry.type === type);
  if (!found) throw new Error(`manca ${type}`);
  return found as Extract<QuoteBlock, { type: T }>;
}

const ids = (document: QuoteDocument) => document.blocks.map((entry) => entry.id);

describe("comandi sul documento", () => {
  it("non modificano mai il documento di partenza", () => {
    const document = demoDocument("minimal");
    const before = JSON.stringify(document);
    ok(document, { kind: "setField", blockId: "b-cover", field: "title", value: "Nuovo titolo" });
    ok(document, { kind: "removeBlock", blockId: "b-intro" });
    ok(document, { kind: "moveBlock", blockId: "b-terms", toIndex: 1 });
    expect(JSON.stringify(document)).toBe(before);
  });

  it("setField scrive testi, voci, passi e punti", () => {
    const document = demoDocument("studio");
    const services = block(document, "services");
    const line = services.items[0]!;
    let next = ok(document, { kind: "setField", blockId: "b-cover", field: "title", value: "Portale clienti" });
    next = ok(next, { kind: "setField", blockId: services.id, field: `items.${line.id}.name`, value: "Design" });
    next = ok(next, { kind: "setField", blockId: services.id, field: `items.${line.id}.unitPriceCents`, value: 123_400 });
    next = ok(next, { kind: "setField", blockId: "b-timeline", field: "steps.s2.title", value: "Wireframe" });
    next = ok(next, { kind: "setField", blockId: "b-intro", field: "points.1", value: "un punto nuovo" });
    expect(block(next, "cover").title).toBe("Portale clienti");
    expect(block(next, "services").items[0]).toMatchObject({ name: "Design", unitPriceCents: 123_400 });
    expect(block(next, "timeline").steps[1]?.title).toBe("Wireframe");
    expect(block(next, "intro").points[1]).toBe("un punto nuovo");
  });

  it("setField rifiuta campi inesistenti, tipi sbagliati e valori fuori schema", () => {
    const document = demoDocument("minimal");
    const services = block(document, "services");
    const line = services.items[0]!;
    expect(apply(document, { kind: "setField", blockId: "b-cover", field: "steps.s1.label", value: "x" })).toEqual({ ok: false, message: "Questo campo non esiste più." });
    expect(apply(document, { kind: "setField", blockId: services.id, field: `items.${line.id}.unitPriceCents`, value: "10" })).toEqual({ ok: false, message: "Valore non valido." });
    expect(apply(document, { kind: "setField", blockId: services.id, field: `items.${line.id}.name`, value: 10 })).toEqual({ ok: false, message: "Valore non valido." });
    const tooLong = apply(document, { kind: "setField", blockId: "b-cover", field: "title", value: "x".repeat(5000) });
    expect(tooLong.ok).toBe(false);
    expect(apply(document, { kind: "setField", blockId: "nessuno", field: "title", value: "x" })).toEqual({ ok: false, message: "Il blocco non esiste più." });
  });

  it("getField legge i percorsi e restituisce undefined per quelli inesistenti", () => {
    const document = demoDocument("studio");
    const cover = block(document, "cover");
    const services = block(document, "services");
    const line = services.items[0]!;
    expect(getField(cover, "title")).toBe("Nuovo Sito Web");
    expect(getField(services, `items.${line.id}.quantityMilli`)).toBe(line.quantityMilli);
    expect(getField(block(document, "intro"), "points.0")).toContain("identità");
    expect(getField(block(document, "timeline"), "steps.s1.label")).toBe("Settimana 1");
    expect(getField(cover, "heading")).toBeUndefined();
    expect(getField(services, "items.nessuno.name")).toBeUndefined();
    expect(getField(block(document, "intro"), "points.9")).toBeUndefined();
  });

  it("setField restituisce il blocco validato senza toccare l'originale", () => {
    const cover = block(demoDocument("minimal"), "cover");
    const result = setField(cover, "subtitle", "Riga uno");
    expect(result.ok && result.value.type === "cover" && result.value.subtitle).toBe("Riga uno");
    expect(cover.subtitle).toBe("Proposta per Cliente Esempio");
  });

  it("duplica un blocco subito dopo, con id nuovi anche per voci e passi", () => {
    const document = demoDocument("minimal");
    const next = ok(document, { kind: "duplicateBlock", blockId: "b-services" });
    const at = ids(document).indexOf("b-services");
    const copy = next.blocks[at + 1];
    expect(copy?.type).toBe("services");
    expect(copy?.id).toBe("new-1");
    const original = block(document, "services");
    if (copy?.type !== "services") throw new Error("tipo");
    expect(copy.items.map((line) => line.name)).toEqual(original.items.map((line) => line.name));
    const originalIds = new Set(original.items.map((line) => line.id));
    expect(copy.items.every((line) => !originalIds.has(line.id))).toBe(true);
  });

  it("i blocchi unici non si duplicano e non si inseriscono due volte", () => {
    const document = demoDocument("minimal");
    expect(apply(document, { kind: "duplicateBlock", blockId: "b-timeline" })).toEqual({ ok: false, message: expect.stringContaining("una sola volta") });
    const second = { ...newBlock("summary"), id: "b-summary-2" };
    expect(apply(document, { kind: "insertBlock", block: second, index: 2 })).toEqual({ ok: false, message: expect.stringContaining("una sola volta") });
  });

  it("inserisce nella posizione indicata e rifiuta id duplicati", () => {
    const document = demoDocument("minimal");
    const text = { ...newBlock("text"), id: "b-text" };
    const at = insertionIndex(document, "b-intro");
    const next = ok(document, { kind: "insertBlock", block: text, index: at });
    expect(ids(next)[at]).toBe("b-text");
    const summary = document.blocks.findIndex((block) => block.type === "summary");
    expect(insertionIndex(document, null)).toBe(summary);
    expect(insertionIndex(document, "nessuno")).toBe(summary);
    expect(apply(next, { kind: "insertBlock", block: text, index: 0 })).toEqual({ ok: false, message: "Due blocchi hanno lo stesso identificativo." });
  });

  it("con copertina o firma selezionata il blocco nuovo va prima del Riepilogo, mai dopo la firma", () => {
    const document = demoDocument("minimal");
    const cover = document.blocks.find((block) => block.type === "cover");
    const contacts = document.blocks.find((block) => block.type === "contacts");
    if (!cover || !contacts) throw new Error("demo senza copertina o contatti");
    const summary = document.blocks.findIndex((block) => block.type === "summary");
    expect(summary).toBeGreaterThan(0);
    expect(insertionIndex(document, cover.id)).toBe(summary);
    expect(insertionIndex(document, contacts.id)).toBe(summary);
    // Without a Riepilogo it lands just before the contacts.
    const noSummary = { ...document, blocks: document.blocks.filter((block) => block.type !== "summary") };
    expect(insertionIndex(noSummary, contacts.id)).toBe(noSummary.blocks.findIndex((block) => block.type === "contacts"));
    // Any other block: right after it, as before.
    const terms = document.blocks.findIndex((block) => block.type === "terms");
    expect(insertionIndex(document, document.blocks[terms]?.id ?? null)).toBe(terms + 1);
  });

  it("non rimuove l'ultimo blocco", () => {
    let document = demoDocument("minimal");
    for (const id of ids(document).slice(1)) document = ok(document, { kind: "removeBlock", blockId: id });
    expect(document.blocks).toHaveLength(1);
    expect(apply(document, { kind: "removeBlock", blockId: "b-cover" })).toEqual({ ok: false, message: "Il preventivo deve avere almeno un blocco." });
  });

  it("riordina solo con gli stessi id", () => {
    const document = demoDocument("minimal");
    const reversed = [...ids(document)].reverse();
    expect(ids(ok(document, { kind: "reorderBlocks", ids: reversed }))).toEqual(reversed);
    expect(apply(document, { kind: "reorderBlocks", ids: reversed.slice(1) }).ok).toBe(false);
    expect(apply(document, { kind: "reorderBlocks", ids: [...reversed.slice(1), "intruso"] }).ok).toBe(false);
  });

  it("in modalità libera la copertina si sposta, in modalità template resta in apertura", () => {
    const document = demoDocument("minimal");
    const moved = ok(document, { kind: "moveBlock", blockId: "b-cover", toIndex: 3 }, "free");
    expect(ids(moved)[3]).toBe("b-cover");
    expect(apply(document, { kind: "moveBlock", blockId: "b-cover", toIndex: 3 }, "template")).toEqual({ ok: false, message: "La copertina resta sempre in apertura." });
    expect(apply(document, { kind: "moveBlock", blockId: "b-intro", toIndex: 0 }, "template").ok).toBe(false);
    expect(ids(ok(document, { kind: "moveBlock", blockId: "b-terms", toIndex: 1 }, "template"))[1]).toBe("b-terms");
  });

  it("una regola già violata prima non blocca modifiche estranee", () => {
    const broken = ok(demoDocument("minimal"), { kind: "moveBlock", blockId: "b-cover", toIndex: 2 }, "free");
    expect(documentProblem(broken, { order: "template" })).toBe("La copertina resta sempre in apertura.");
    expect(apply(broken, { kind: "setField", blockId: "b-intro", field: "heading", value: "Ciao" }, "template").ok).toBe(true);
  });

  it("rispetta i limiti di blocchi e voci", () => {
    let document = demoDocument("minimal");
    let n = 0;
    while (document.blocks.length < 40) document = ok(document, { kind: "insertBlock", block: { ...newBlock("text"), id: `t-${n++}` }, index: 1 });
    expect(apply(document, { kind: "insertBlock", block: { ...newBlock("text"), id: "troppi" }, index: 1 })).toEqual({ ok: false, message: "Al massimo 40 blocchi per preventivo." });
    const services = block(demoDocument("minimal"), "services");
    const many = Array.from({ length: 201 }, (_, index) => ({ ...services.items[0]!, id: `l-${index}` }));
    const big = { ...demoDocument("minimal"), blocks: [{ ...services, items: many }] };
    expect(documentProblem(big)).toBe("Al massimo 200 voci per preventivo.");
  });

  it("visibilità, stile e ritenuta", () => {
    const document = demoDocument("minimal");
    expect(block(ok(document, { kind: "toggleBlock", blockId: "b-intro" }), "intro").visible).toBe(!block(document, "intro").visible);
    const style = { ...document.style, accent: "#123456" };
    expect(ok(document, { kind: "setStyle", style }).style.accent).toBe("#123456");
    expect(ok(document, { kind: "setWithholding", bp: 2000 }).withholdingBp).toBe(2000);
    expect(apply(document, { kind: "setWithholding", bp: 6000 })).toEqual({ ok: false, message: "Ritenuta non valida." });
    expect(apply(document, { kind: "setWithholding", bp: 10.5 }).ok).toBe(false);
  });

  it("il tipo di un blocco non cambia sostituendolo", () => {
    const document = demoDocument("minimal");
    const fake = { ...newBlock("text"), id: "b-intro" };
    expect(apply(document, { kind: "replaceBlock", block: fake })).toEqual({ ok: false, message: "Il tipo di blocco non può cambiare." });
  });
});
