import { describe, expect, it } from "vitest";
import { lockedChange, lockedChangeMessage } from "@/domain/locks";
import { newBlock, type QuoteBlock, type QuoteDocument } from "@/domain/quote-document";

const doc = (blocks: QuoteBlock[]): QuoteDocument => ({ version: 1, blocks }) as unknown as QuoteDocument;
const text = (id: string, extra: Record<string, unknown> = {}) => ({ ...newBlock("text"), id, heading: "Metodo", body: "Testo", ...extra }) as QuoteBlock;

describe("lucchetto sul server", () => {
  it("rifiuta un cambio di contenuto su un blocco bloccato prima e dopo", () => {
    const before = doc([text("a", { locked: true })]);
    const change = lockedChange(before, doc([text("a", { locked: true, body: "Altro" })]));
    expect(change?.id).toBe("a");
    expect(lockedChangeMessage(change as QuoteBlock)).toBe('Il blocco "Metodo" è bloccato: sbloccalo dalla struttura per modificarlo.');
  });

  it("lascia spostare, nascondere, mettere in colonna e sbloccare", () => {
    const before = doc([text("x"), text("a", { locked: true })]);
    expect(lockedChange(before, doc([text("a", { locked: true, visible: false, col: { row: "r", span: 3 } }), text("x")]))).toBeNull();
    expect(lockedChange(before, doc([text("x"), text("a", { body: "Sbloccato e cambiato" })]))).toBeNull();
    // Locked in the same save as the edit: the stored block was free.
    expect(lockedChange(doc([text("a")]), doc([text("a", { locked: true, body: "Nuovo" })]))).toBeNull();
  });

  it("non dipende dall'ordine delle chiavi", () => {
    const block = text("a", { locked: true });
    const reordered = Object.fromEntries(Object.entries(block).reverse()) as QuoteBlock;
    expect(lockedChange(doc([block]), doc([reordered]))).toBeNull();
  });
});
