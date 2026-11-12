import { describe, expect, it } from "vitest";
import { applyCommand } from "@/domain/document-ops";
import type { QuoteDocument } from "@/domain/quote-document";
import { addableTypes, blockActions, hitTarget, typeahead, type Gap } from "@/components/quote-editor/visuale/menu-model";
import { clampMenu } from "@/components/quote-editor/visuale/context-menu";
import { changedBlockIds } from "@/components/quote-editor/state/changes";
import { demoDocument } from "./fixtures/template-demo";

const demo = demoDocument("minimal");
const ids = (document: QuoteDocument) => document.blocks.map((block) => block.id);
const typeOf = (document: QuoteDocument, type: string) => {
  const found = document.blocks.find((block) => block.type === type);
  if (!found) throw new Error(`manca ${type}`);
  return found;
};
function ok(document: QuoteDocument, command: Parameters<typeof applyCommand>[1]) {
  const result = applyCommand(document, command, { order: "template" });
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

describe("menu contestuale: cosa c'è sotto il puntatore", () => {
  const boxes = [
    { id: "a", x: 100, y: 100, w: 400, h: 100 },
    { id: "b", x: 100, y: 240, w: 400, h: 100 },
  ];
  const gaps: Gap[] = [
    { key: "before:a", x: 100, y: 88, w: 400, index: 1, where: "" },
    { key: "before:b", x: 100, y: 220, w: 400, index: 2, where: "" },
    { key: "end", x: 100, y: 356, w: 400, index: 3, where: "" },
  ];

  it("dentro un blocco apre il menu del blocco", () => {
    expect(hitTarget({ x: 300, y: 150 }, boxes, gaps)).toEqual({ kind: "block", id: "a" });
    expect(hitTarget({ x: 100, y: 340 }, boxes, gaps)).toEqual({ kind: "block", id: "b" });
  });

  it("tra due blocchi, o nel margine, sceglie il punto di inserimento più vicino", () => {
    expect(hitTarget({ x: 300, y: 222 }, boxes, gaps)).toMatchObject({ kind: "gap", gap: { index: 2 } });
    expect(hitTarget({ x: 40, y: 130 }, boxes, gaps)).toMatchObject({ kind: "gap", gap: { index: 1 } });
    expect(hitTarget({ x: 300, y: 600 }, boxes, gaps)).toMatchObject({ kind: "gap", gap: { index: 3 } });
  });

  it("senza blocchi né punti non apre nulla", () => {
    expect(hitTarget({ x: 0, y: 0 }, [], [])).toBeNull();
  });
});

describe("menu contestuale: azioni consentite", () => {
  it("la copertina non si sposta né si elimina, e niente si aggiunge sopra", () => {
    const cover = typeOf(demo, "cover");
    const actions = blockActions(demo, cover.id, false);
    expect(actions.moveUp).toBe(false);
    expect(actions.moveDown).toBe(false);
    expect(actions.insertBefore).toBe(false);
    expect(actions.toggle).toBe(true);
  });

  it("il primo contenuto dopo la copertina non sale, ma scende e si duplica", () => {
    const first = demo.blocks[1];
    if (!first) throw new Error("documento vuoto");
    const actions = blockActions(demo, first.id, false);
    expect(actions.moveUp).toBe(false);
    expect(actions.moveDown).toBe(true);
    expect(actions.duplicate).toBe(true);
    expect(actions.edit).toBe(true);
  });

  it("un blocco bloccato non si modifica né si elimina, ma si sblocca", () => {
    const first = demo.blocks[1];
    if (!first) throw new Error("documento vuoto");
    const locked = ok(demo, { kind: "lockBlock", blockId: first.id, locked: true });
    const actions = blockActions(locked, first.id, false);
    expect(actions.edit).toBe(false);
    expect(actions.remove).toBe(false);
    expect(actions.lock).toBe(true);
  });

  it("in sola lettura non c'è nessuna azione", () => {
    const first = demo.blocks[1];
    if (!first) throw new Error("documento vuoto");
    expect(Object.values(blockActions(demo, first.id, true)).some(Boolean)).toBe(false);
  });

  it("i blocchi unici già presenti risultano spenti, la copertina non si offre", () => {
    const { content, once } = addableTypes(demo);
    expect(content.map((entry) => entry.type)).toEqual(["text", "image", "services", "options", "highlights", "terms", "intro"]);
    expect(content.every((entry) => !entry.taken)).toBe(true);
    expect(once.map((entry) => entry.type)).toEqual(["summary", "timeline", "contacts"]);
    const present = new Set(demo.blocks.map((block) => block.type));
    for (const entry of once) expect(entry.taken).toBe(present.has(entry.type));
  });
});

describe("menu contestuale: tastiera e posizione", () => {
  it("le lettere portano alla voce che inizia così, dopo quella attiva", () => {
    const labels = ["Modifica il testo", "Aggiungi sopra", "Aggiungi sotto", "Duplica", null, "Elimina"];
    expect(typeahead(labels, 0, "d")).toBe(3);
    expect(typeahead(labels, 1, "a")).toBe(2);
    expect(typeahead(labels, 2, "a")).toBe(1);
    expect(typeahead(labels, 0, "z")).toBe(0);
  });

  it("vicino al bordo si apre verso l'alto o verso sinistra, sempre dentro lo schermo", () => {
    const viewport = { w: 1000, h: 800 };
    expect(clampMenu({ x: 100, y: 100 }, { w: 272, h: 400 }, viewport)).toEqual({ x: 100, y: 100 });
    expect(clampMenu({ x: 900, y: 100 }, { w: 272, h: 400 }, viewport)).toEqual({ x: 720, y: 100 });
    expect(clampMenu({ x: 100, y: 700 }, { w: 272, h: 400 }, viewport)).toEqual({ x: 100, y: 300 });
    expect(clampMenu({ x: 100, y: 300 }, { w: 272, h: 600 }, viewport)).toEqual({ x: 100, y: 192 });
    // A submenu that does not fit on the right opens on the left of its parent.
    expect(clampMenu({ x: 900, y: 100 }, { w: 300, h: 200 }, viewport, 620)).toEqual({ x: 320, y: 100 });
  });
});

describe("annulla e ripeti: cosa evidenziare", () => {
  it("un testo modificato, un blocco nuovo e uno spostato", () => {
    const first = demo.blocks[1];
    const second = demo.blocks[2];
    if (!first || !second) throw new Error("documento corto");
    const edited = ok(demo, { kind: "setField", blockId: first.id, field: "heading", value: "Titolo nuovo" });
    expect(changedBlockIds(demo, edited)).toEqual([first.id]);
    const duplicated = ok(demo, { kind: "duplicateBlock", blockId: first.id });
    const copy = duplicated.blocks[2];
    expect(changedBlockIds(demo, duplicated)).toEqual([copy?.id]);
    const moved = ok(demo, { kind: "moveBlock", blockId: first.id, toIndex: 2 });
    expect(changedBlockIds(demo, moved).sort()).toEqual([first.id, second.id].sort());
    expect(changedBlockIds(demo, demo)).toEqual([]);
    expect(ids(moved)).not.toEqual(ids(demo));
  });
});
