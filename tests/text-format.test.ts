import { describe, expect, it } from "vitest";
import { applyCommand, getField } from "@/domain/document-ops";
import { documentSchema as quoteDocumentSchema, type QuoteBlock, type QuoteDocument } from "@/domain/quote-document";
import { applyMark, markValueIn, normalizeMarks, remapMarks, splitRuns, textFormatSchema, fontsInFormats, fieldRole } from "@/domain/text-format";
import { fontCssHref, fontFamilyName, isFontRef, parseFaces, proxiedFontPath, rewriteCss, upstreamFileUrl } from "@/domain/fonts";
import { findFont } from "@/domain/fonts/catalog";
import { asBrandFont, brandInputSchema } from "@/domain/brand";
import { formatContext, locate, withFormats } from "@/components/quote-render/format";
import { webKit } from "@/components/quote-render/kit-web";
import { demoDocument, demoSnapshot } from "./fixtures/template-demo";
import { webMarkup } from "./helpers/fingerprint";

function counter() {
  let n = 0;
  return () => `new-${++n}`;
}

function ok(document: QuoteDocument, command: Parameters<typeof applyCommand>[1]): QuoteDocument {
  const result = applyCommand(document, command, { makeId: counter(), order: "free" });
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

function firstWith(document: QuoteDocument, field: string): QuoteBlock {
  const found = document.blocks.find((block) => typeof getField(block, field as never) === "string");
  if (!found) throw new Error(`nessun blocco con ${field}`);
  return found;
}

describe("segni di formattazione", () => {
  it("applica e toglie il grassetto su un intervallo, fondendo i pezzi uguali", () => {
    let marks = applyMark([], 11, 0, 5, { b: true });
    marks = applyMark(marks, 11, 5, 8, { b: true });
    expect(marks).toEqual([{ s: 0, e: 8, b: true }]);
    marks = applyMark(marks, 11, 2, 4, { b: false });
    expect(marks).toEqual([
      { s: 0, e: 2, b: true },
      { s: 4, e: 8, b: true },
    ]);
  });

  it("sovrappone attributi diversi senza sovrapporre i segni", () => {
    const marks = applyMark(applyMark([], 10, 0, 6, { i: true }), 10, 3, 10, { c: "#7C3AED" });
    expect(marks).toEqual([
      { s: 0, e: 3, i: true },
      { s: 3, e: 6, i: true, c: "#7C3AED" },
      { s: 6, e: 10, c: "#7C3AED" },
    ]);
    expect(markValueIn(marks, 3, 6, "i")).toBe(true);
    expect(markValueIn(marks, 0, 10, "i")).toBeUndefined();
  });

  it("taglia i segni fuori dal testo", () => {
    expect(normalizeMarks([{ s: 4, e: 50, u: true }], 8)).toEqual([{ s: 4, e: 8, u: true }]);
    expect(normalizeMarks([{ s: 9, e: 12, u: true }], 8)).toEqual([]);
  });

  it("tiene i segni sulle stesse parole quando il testo cambia altrove", () => {
    const before = "Sito web veloce";
    const marks = [{ s: 9, e: 15, b: true }];
    expect(remapMarks(marks, before, "Il sito web veloce")).toEqual([{ s: 12, e: 18, b: true }]);
    expect(remapMarks(marks, before, "Sito veloce")).toEqual([{ s: 5, e: 11, b: true }]);
  });

  it("divide un paragrafo in tratti con il proprio stile", () => {
    const runs = splitRuns("mondo bello", 6, [{ s: 6, e: 11, b: true }]);
    expect(runs).toEqual([
      { text: "mondo", attrs: { b: true }, from: 6 },
      { text: " bello", attrs: null, from: 11 },
    ]);
  });

  it("accetta solo link sicuri", () => {
    expect(textFormatSchema.safeParse({ marks: [{ s: 0, e: 2, href: "https://ctrlagency.dev" }] }).success).toBe(true);
    expect(textFormatSchema.safeParse({ marks: [{ s: 0, e: 2, href: "mailto:ciao@ctrlagency.dev" }] }).success).toBe(true);
    expect(textFormatSchema.safeParse({ marks: [{ s: 0, e: 2, href: "javascript:alert(1)" }] }).success).toBe(false);
    expect(textFormatSchema.safeParse({ marks: [{ s: 0, e: 2, href: "data:text/html,x" }] }).success).toBe(false);
    expect(textFormatSchema.safeParse({ color: "red; background:url(x)" }).success).toBe(false);
  });

  it("sa quali campi sono titoli", () => {
    expect(fieldRole("title")).toBe("heading");
    expect(fieldRole("items.a1.title")).toBe("heading");
    expect(fieldRole("body")).toBe("body");
  });
});

describe("comandi di formattazione", () => {
  const document = demoDocument("editorial");

  it("i documenti senza formattazione restano validi (schema retrocompatibile)", () => {
    expect(quoteDocumentSchema.safeParse(document).success).toBe(true);
  });

  it("setRich salva testo e segni, setField li sposta con il testo", () => {
    const block = firstWith(document, "title");
    const value = getField(block, "title") as string;
    let next = ok(document, { kind: "setRich", blockId: block.id, field: "title", value: `Ciao ${value}`, marks: [{ s: 0, e: 4, b: true }] });
    let saved = next.blocks.find((entry) => entry.id === block.id) as QuoteBlock;
    expect(saved.fmt?.title?.marks).toEqual([{ s: 0, e: 4, b: true }]);
    next = ok(next, { kind: "setField", blockId: block.id, field: "title", value: `Oh, Ciao ${value}` });
    saved = next.blocks.find((entry) => entry.id === block.id) as QuoteBlock;
    expect(saved.fmt?.title?.marks).toEqual([{ s: 4, e: 8, b: true }]);
    expect(quoteDocumentSchema.safeParse(next).success).toBe(true);
  });

  it("setFormat e setLook si annullano con resetBlockStyle", () => {
    const block = firstWith(document, "title");
    let next = ok(document, { kind: "setFormat", blockId: block.id, field: "title", format: { font: "g:Playfair Display", size: 30, align: "center" } });
    next = ok(next, { kind: "setLook", blockId: block.id, look: { mt: 12, bg: "#F4F2FF", radius: 8 } });
    const styled = next.blocks.find((entry) => entry.id === block.id) as QuoteBlock;
    expect(styled.fmt?.title).toMatchObject({ font: "g:Playfair Display", size: 30 });
    expect(styled.look).toMatchObject({ mt: 12, bg: "#F4F2FF" });
    next = ok(next, { kind: "resetBlockStyle", blockId: block.id });
    const reset = next.blocks.find((entry) => entry.id === block.id) as QuoteBlock;
    expect(reset.fmt).toBeUndefined();
    expect(reset.look).toBeUndefined();
  });

  it("rifiuta la formattazione su campi che non sono testo", () => {
    const block = firstWith(document, "title");
    const result = applyCommand(document, { kind: "setFormat", blockId: block.id, field: "nonEsiste" as never, format: { bold: true } }, { makeId: counter(), order: "free" });
    expect(result.ok).toBe(false);
  });
});

describe("libreria font", () => {
  it("riconosce i riferimenti e i nomi di famiglia", () => {
    expect(isFontRef("g:Playfair Display")).toBe(true);
    expect(isFontRef("fs:satoshi")).toBe(true);
    expect(isFontRef("Inter")).toBe(false);
    expect(isFontRef("g:<script>")).toBe(false);
    expect(fontFamilyName("g:Playfair Display")).toBe("cqf-g-playfair-display");
    expect(findFont("g:Playfair Display")?.category).toBe("serif");
    expect(findFont("fs:satoshi")).not.toBeNull();
  });

  it("riscrive il CSS dei font verso il proxy dello stesso dominio", () => {
    const css = `@font-face { font-family: 'Playfair Display'; font-style: normal; font-weight: 400; font-display: swap; src: url(https://fonts.gstatic.com/s/playfairdisplay/v37/abc.woff2) format('woff2'); unicode-range: U+0000-00FF; }
@font-face { font-family: 'Evil'; font-style: normal; font-weight: 400; src: url(https://evil.example/x.woff2) format('woff2'); }`;
    const faces = parseFaces(css);
    expect(faces.length).toBeGreaterThanOrEqual(1);
    const out = rewriteCss("g:Playfair Display", faces);
    expect(out).toContain("cqf-g-playfair-display");
    expect(out).toContain("/api/fonts/file/g/s/playfairdisplay/v37/abc.woff2");
    expect(out).not.toContain("evil.example");
    expect(out).not.toContain("fonts.gstatic.com");
  });

  it("il proxy dei file accetta solo host e percorsi noti", () => {
    expect(proxiedFontPath("https://fonts.gstatic.com/s/inter/v1/a.woff2")).toBe("/api/fonts/file/g/s/inter/v1/a.woff2");
    expect(proxiedFontPath("https://evil.example/a.woff2")).toBeNull();
    expect(upstreamFileUrl("g", "s/inter/v1/a.woff2")).toBe("https://fonts.gstatic.com/s/inter/v1/a.woff2");
    expect(upstreamFileUrl("g", "../../etc/passwd.woff2")).toBeNull();
    expect(upstreamFileUrl("x", "a.woff2")).toBeNull();
    expect(fontCssHref([])).toBeNull();
    expect(fontCssHref(["g:Playfair Display", "fs:satoshi"])).toMatch(/^\/api\/fonts\/css\?/);
  });

  it("i vecchi font del Brand Kit diventano quelli del template", () => {
    expect(asBrandFont("Inter")).toBe("template");
    expect(asBrandFont("g:Lora")).toBe("g:Lora");
    expect(fontsInFormats([{ title: { font: "g:Lora", marks: [{ s: 0, e: 1, f: "fs:satoshi" }] } }])).toEqual(["g:Lora", "fs:satoshi"]);
    expect(brandInputSchema.shape.fontHeading.parse("Instrument Serif")).toBe("template");
    expect(() => brandInputSchema.shape.fontHeading.parse("Comic Sans")).toThrow();
  });
});

describe("resa della formattazione", () => {
  it("trova il testo stampato dentro il valore", () => {
    expect(locate("Ciao", "Ciao", null)).toBe(0);
    expect(locate("mondo", "Ciao mondo", 5)).toBe(5);
    expect(locate("“Ciao”", "Ciao", null)).toBe(-1);
    expect(locate("x", "", null)).toBeNull();
  });

  it("la pagina web applica font, segni e link senza HTML dall'utente", () => {
    const snapshot = demoSnapshot("editorial");
    const block = firstWith(snapshot.document, "title");
    const title = '<script>alert(1)</script> Sito';
    let document = ok(snapshot.document, { kind: "setRich", blockId: block.id, field: "title", value: title, marks: [{ s: 26, e: 30, b: true, href: "https://ctrlagency.dev" }] });
    document = ok(document, { kind: "setFormat", blockId: block.id, field: "title", format: { ...(document.blocks.find((entry) => entry.id === block.id)?.fmt?.title ?? {}), font: "g:Playfair Display" } });
    const formatted = { ...snapshot, document };
    const html = webMarkup(formatted, withFormats(webKit, formatContext(document, formatted.brand)));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("cqf-g-playfair-display");
    expect(html).toMatch(/<a [^>]*href="https:\/\/ctrlagency.dev"[^>]*rel="noopener noreferrer nofollow"/);
  });

  it("senza formattazione il markup non cambia", () => {
    const snapshot = demoSnapshot("editorial");
    expect(webMarkup(snapshot, withFormats(webKit, formatContext(snapshot.document, snapshot.brand)))).toBe(webMarkup(snapshot, webKit));
  });
});
