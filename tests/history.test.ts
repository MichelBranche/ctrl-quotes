import { describe, expect, it } from "vitest";
import { createHistory, GROUP_MS, HISTORY_LIMIT, record, redo, reset, undo } from "@/components/quote-editor/state/history";

describe("cronologia", () => {
  it("annulla e ripete nell'ordine giusto", () => {
    let h = createHistory("a");
    h = record(h, "b", { now: 0 });
    h = record(h, "c", { now: 10_000 });
    h = undo(h);
    expect(h.present).toBe("b");
    h = undo(h);
    expect(h.present).toBe("a");
    expect(undo(h)).toBe(h);
    h = redo(h);
    h = redo(h);
    expect(h.present).toBe("c");
    expect(redo(h)).toBe(h);
  });

  it("una modifica nuova cancella il ripeti", () => {
    let h = record(record(createHistory(1), 2, { now: 0 }), 3, { now: 5000 });
    h = undo(h);
    h = record(h, 4, { now: 9000 });
    expect(h.future).toEqual([]);
    expect(h.past).toEqual([1, 2]);
  });

  it("unisce la digitazione nello stesso campo entro la finestra", () => {
    let h = createHistory("");
    h = record(h, "C", { group: "block:a", now: 0 });
    h = record(h, "Ci", { group: "block:a", now: GROUP_MS - 1 });
    h = record(h, "Cia", { group: "block:a", now: 2 * GROUP_MS - 2 });
    expect(h.past).toEqual([""]);
    h = record(h, "Ciao", { group: "block:a", now: 4 * GROUP_MS });
    expect(h.past).toEqual(["", "Cia"]);
    h = record(h, "x", { group: "block:b", now: 4 * GROUP_MS + 1 });
    expect(h.past).toEqual(["", "Cia", "Ciao"]);
    expect(undo(h).present).toBe("Ciao");
  });

  it("dopo un annulla la digitazione riparte da un passo nuovo", () => {
    let h = record(record(createHistory("a"), "ab", { group: "g", now: 0 }), "abc", { group: "g", now: 10 });
    h = undo(h);
    h = record(h, "aX", { group: "g", now: 20 });
    expect(h.past).toEqual(["a"]);
  });

  it(`tiene al massimo ${HISTORY_LIMIT} passi`, () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 30; i += 1) h = record(h, i, { now: i * 10_000 });
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(30);
    for (let i = 0; i < HISTORY_LIMIT; i += 1) h = undo(h);
    expect(h.present).toBe(30);
    expect(undo(h)).toBe(h);
  });

  it("ignora un valore identico e azzera con reset", () => {
    const h = createHistory({ a: 1 });
    expect(record(h, h.present)).toBe(h);
    const r = reset("x");
    expect(r).toEqual({ past: [], present: "x", future: [], group: null });
  });
});
