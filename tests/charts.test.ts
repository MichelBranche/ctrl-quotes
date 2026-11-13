import { describe, expect, it } from "vitest";
import { buildModel, computeBreakdown, type Resources } from "@/components/quote-render/model";
import { allocate, costData, parseLength, parsePaymentTerms, parseRange, paymentData, resolveVat, timelineData, wholePercents } from "@/domain/charts";
import { applyCommand } from "@/domain/document-ops";
import { computeTotals, documentSchema, newBlock, type QuoteBlock, type QuoteDocument, type QuoteLine } from "@/domain/quote-document";
import type { QuoteSnapshot } from "@/domain/quote-snapshot";
import { templateKeys } from "@/domain/templates";
import { renderQuotePdf } from "@/server/pdf/quote-pdf";
import { demoSnapshot } from "./fixtures/template-demo";

const fiscal = { taxProfile: "ordinario" as const, stampDutyNote: false };

function line(id: string, name: string, cents: number, extra: Partial<QuoteLine> = {}): QuoteLine {
  return {
    id,
    catalogItemId: null,
    name,
    description: "",
    unit: "",
    quantityMilli: 1000,
    unitPriceCents: cents,
    priceMode: "net",
    taxRateBp: 2200,
    taxNature: null,
    discountBp: 0,
    billing: "una_tantum",
    periods: null,
    ...extra,
  };
}

function doc(blocks: unknown[]): QuoteDocument {
  return documentSchema.parse({ blocks, withholdingBp: 0, style: { accent: "template", photos: {} } });
}

function withCharts(snapshot: QuoteSnapshot, blocks: QuoteBlock[]): QuoteSnapshot {
  const document = { ...snapshot.document, blocks: [...snapshot.document.blocks, ...blocks] };
  return { ...snapshot, document, totals: computeTotals(document, snapshot.fiscal) };
}

const resources: Resources = { logo: null, photo: () => null, image: () => null, watermark: null, versionLabel: null };

describe("ripartizione esatta", () => {
  it("allocate somma sempre al totale e premia i resti più grandi", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(1001, [500, 300, 200])).toEqual([501, 300, 200]);
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
    expect(allocate(10, [0, 0])).toEqual([0, 0]);
  });

  it("le percentuali intere sommano a 100 anche con quote periodiche", () => {
    for (const values of [[1, 1, 1], [800, 1500, 3200, 600, 400], [1, 999_999], [7, 7, 7, 7, 7, 7, 7]]) {
      const percents = wholePercents(values);
      expect(percents.reduce((a, b) => a + b, 0)).toBe(100);
    }
  });
});

describe("grafico dei costi", () => {
  const document = doc([
    { id: "s1", type: "services", heading: "Design", items: [line("a", "UX", 150_000), line("b", "UI", 100_000, { taxRateBp: 1000 })] },
    { id: "s2", type: "services", heading: "Sviluppo", items: [line("c", "Frontend", 333_33), line("d", "Hosting", 2_000, { billing: "mensile" })] },
    { id: "s3", type: "services", heading: "Nascosto", visible: false, items: [line("e", "Mai", 999_999)] },
  ]);
  const totals = computeTotals(document, fiscal);

  it("IVA esclusa: le fette sommano all'imponibile una tantum del Riepilogo", () => {
    const data = costData(document, "ordinario", totals.main, { group: "line", vat: "net", max: 6 });
    if (!("slices" in data)) throw new Error("vuoto");
    expect(data.basis).toBe("oneTime");
    expect(data.totalCents).toBe(totals.main.oneTime.netCents);
    expect(data.slices.map((slice) => slice.label)).toEqual(["UX", "UI", "Frontend"]);
    expect(data.slices.reduce((sum, slice) => sum + slice.percent, 0)).toBe(100);
  });

  it("IVA inclusa: le fette sommano al totale una tantum, con l'IVA di ogni aliquota ripartita al centesimo", () => {
    const data = costData(document, "ordinario", totals.main, { group: "line", vat: "gross", max: 6 });
    if (!("slices" in data)) throw new Error("vuoto");
    expect(data.totalCents).toBe(totals.main.oneTime.totalCents);
    // UI is at 10%: 1.000,00 + 100,00
    expect(data.slices.find((slice) => slice.label === "UI")?.cents).toBe(110_000);
  });

  it("per sezione usa i titoli dei blocchi Servizi visibili", () => {
    const data = costData(document, "ordinario", totals.main, { group: "section", vat: "net", max: 6 });
    if (!("slices" in data)) throw new Error("vuoto");
    expect(data.slices.map((slice) => [slice.label, slice.cents])).toEqual([
      ["Design", 250_000],
      ["Sviluppo", 33_333],
    ]);
  });

  it("oltre il massimo raggruppa le voci più piccole in «Altre N voci»", () => {
    const many = doc([{ id: "s", type: "services", heading: "", items: Array.from({ length: 9 }, (_, index) => line(`l${index}`, `Voce ${index}`, (index + 1) * 10_000)) }]);
    const data = costData(many, "ordinario", computeTotals(many, fiscal).main, { group: "line", vat: "net", max: 6 });
    if (!("slices" in data)) throw new Error("vuoto");
    expect(data.slices).toHaveLength(6);
    expect(data.slices[5]?.label).toBe("Altre 4 voci");
    expect(data.slices[5]?.cents).toBe((1 + 2 + 3 + 4) * 10_000);
    expect(data.totalCents).toBe(computeTotals(many, fiscal).main.oneTime.netCents);
  });

  it("senza servizi a prezzo dice cosa manca", () => {
    const empty = doc([{ id: "s", type: "services", heading: "", items: [line("z", "Gratis", 0)] }]);
    const data = costData(empty, "ordinario", computeTotals(empty, fiscal).main, { group: "line", vat: "net", max: 6 });
    expect(data).toEqual({ ok: false, reason: "Aggiungi servizi con un prezzo per vedere il grafico." });
  });

  it("solo canoni: usa il canone mensile", () => {
    const monthly = doc([{ id: "s", type: "services", heading: "", items: [line("m", "Hosting", 5_000, { billing: "mensile" })] }]);
    const data = costData(monthly, "ordinario", computeTotals(monthly, fiscal).main, { group: "line", vat: "net", max: 6 });
    expect("slices" in data && data.basis).toBe("monthly");
  });

  it("forfettario: nessuna IVA, importi pieni", () => {
    expect(resolveVat("chartCosts", "gross", "forfettario")).toBe("none");
    expect(resolveVat("chartCosts", "auto", "ordinario")).toBe("net");
    expect(resolveVat("chartPayments", "auto", "ordinario")).toBe("gross");
  });

  it("la ripartizione del Riepilogo (Corporate e Bold) resta quella di prima", () => {
    expect(computeBreakdown(demoSnapshot("corporate")).map((row) => [row.name, row.percent])).toEqual([
      ["Sviluppo sito web", "49%"],
      ["UX/UI Design", "23%"],
      ["Analisi e strategia", "12%"],
      ["Contenuti di base", "9%"],
      ["Go live e formazione", "6%"],
    ]);
  });
});

describe("piano pagamenti", () => {
  it("legge rate con descrizione", () => {
    const parsed = parsePaymentTerms("40% alla conferma dell'ordine, 40% a sviluppo completato, 20% alla messa online.");
    expect(parsed).toEqual({
      ok: true,
      rates: [
        { label: "Alla conferma dell'ordine", bp: 4000 },
        { label: "A sviluppo completato", bp: 4000 },
        { label: "Alla messa online", bp: 2000 },
      ],
    });
  });

  it("acconto e saldo: il saldo prende il resto", () => {
    const parsed = parsePaymentTerms("Acconto del 30% alla firma e saldo alla consegna");
    expect(parsed).toEqual({ ok: true, rates: [{ label: "Acconto alla firma", bp: 3000 }, { label: "Saldo alla consegna", bp: 7000 }] });
  });

  it("decimali con la virgola", () => {
    const parsed = parsePaymentTerms("33,5% all'ordine; 66,5% alla consegna");
    expect(parsed.ok && parsed.rates.map((rate) => rate.bp)).toEqual([3350, 6650]);
  });

  it("rifiuta rate che non fanno 100% e testi senza percentuali", () => {
    expect(parsePaymentTerms("40% alla firma, 40% alla consegna").ok).toBe(false);
    expect(parsePaymentTerms("Bonifico a 30 giorni data fattura").ok).toBe(false);
    expect(parsePaymentTerms("60% subito, 60% dopo").ok).toBe(false);
  });

  it("gli importi sommano al totale una tantum, IVA inclusa o esclusa", () => {
    const snapshot = demoSnapshot("minimal");
    const gross = paymentData(snapshot.document, snapshot.totals.main, "gross");
    const net = paymentData(snapshot.document, snapshot.totals.main, "net");
    if (!("rates" in gross) || !("rates" in net)) throw new Error("vuoto");
    expect(gross.rates.reduce((sum, rate) => sum + rate.cents, 0)).toBe(snapshot.totals.main.oneTime.totalCents);
    expect(net.rates.reduce((sum, rate) => sum + rate.cents, 0)).toBe(snapshot.totals.main.oneTime.netCents);
    expect(net.rates.map((rate) => rate.cents)).toEqual([260_000, 260_000, 130_000]);
  });
});

describe("timeline", () => {
  it("legge periodi e durate", () => {
    expect(parseRange("Settimane 2-3")).toEqual({ unit: "settimana", start: 1, end: 3 });
    expect(parseRange("Settimana 7")).toEqual({ unit: "settimana", start: 6, end: 7 });
    expect(parseRange("Mesi 1\u20132")).toEqual({ unit: "mese", start: 0, end: 2 });
    expect(parseRange("Fase 1")).toBeNull();
    expect(parseLength("3 settimane")).toEqual({ unit: "settimana", length: 3 });
  });

  it("dalle Tempistiche del preventivo, con la scala reale", () => {
    const data = timelineData(demoSnapshot("minimal").document);
    if (!("phases" in data)) throw new Error("vuoto");
    expect(data.unit).toBe("settimana");
    expect(data.span).toBe(7);
    expect(data.phases.map((phase) => [phase.start, phase.end])).toEqual([
      [0, 1],
      [1, 3],
      [3, 6],
      [6, 7],
    ]);
  });

  it("durate in sequenza, oppure fasi in ordine se i periodi non si leggono", () => {
    const lengths = doc([{ id: "t", type: "timeline", heading: "", steps: [{ id: "a", label: "2 settimane", title: "A" }, { id: "b", label: "3 settimane", title: "B" }] }]);
    const a = timelineData(lengths);
    expect("phases" in a && a.phases.map((phase) => [phase.start, phase.end])).toEqual([
      [0, 2],
      [2, 5],
    ]);
    const free = doc([{ id: "t", type: "timeline", heading: "", steps: [{ id: "a", label: "Fase 1", title: "A" }, { id: "b", label: "Dopo", title: "B" }] }]);
    const b = timelineData(free);
    expect("phases" in b && b.unit).toBeNull();
    expect("phases" in timelineData(doc([{ id: "x", type: "text", heading: "", body: "a" }]))).toBe(false);
  });
});

describe("blocchi grafico nel documento", () => {
  it("i documenti vecchi si leggono identici", () => {
    const snapshot = demoSnapshot("studio");
    expect(documentSchema.parse(JSON.parse(JSON.stringify(snapshot.document)))).toEqual(snapshot.document);
  });

  it("un grafico salvato con i soli campi minimi prende i valori predefiniti", () => {
    const parsed = documentSchema.parse({ blocks: [{ id: "g", type: "chartCosts" }] });
    expect(parsed.blocks[0]).toMatchObject({ type: "chartCosts", heading: "", variant: "donut", group: "line", vat: "auto", legend: true, amounts: true, percents: true, visible: true });
  });

  it("si inseriscono, si duplicano e si modificano con i comandi (quindi annulla e ripeti)", () => {
    const snapshot = demoSnapshot("minimal");
    const chart = newBlock("chartCosts");
    const inserted = applyCommand(snapshot.document, { kind: "insertBlock", block: chart, index: 3 });
    if (!inserted.ok) throw new Error(inserted.message);
    const twice = applyCommand(inserted.value, { kind: "duplicateBlock", blockId: chart.id });
    expect(twice.ok).toBe(true);
    const changed = applyCommand(inserted.value, { kind: "replaceBlock", block: { ...chart, variant: "pie" } as QuoteBlock });
    expect(changed.ok && changed.value.blocks[3]).toMatchObject({ type: "chartCosts", variant: "pie" });
    expect(applyCommand(inserted.value, { kind: "setField", blockId: chart.id, field: "heading", value: "Dove vanno i soldi" }).ok).toBe(true);
  });

  it("senza dati il PDF salta il blocco, l'editor mostra cosa manca", () => {
    const base = demoSnapshot("minimal");
    const noTerms = { ...base, document: { ...base.document, blocks: base.document.blocks.filter((block) => block.type !== "terms") } };
    const snapshot = withCharts(noTerms, [newBlock("chartPayments")]);
    const pdfModel = buildModel(snapshot, resources, "fromCover");
    expect(pdfModel.pages.flat().some((section) => section.kind === "chart")).toBe(false);
    const editorModel = buildModel(snapshot, { ...resources, placeholders: true }, "fromCover");
    const section = editorModel.pages.flat().find((entry) => entry.kind === "chart");
    expect(section && section.kind === "chart" && section.chart.type).toBe("empty");
  });

  it("con i dati il modello porta importi formattati in italiano e un riassunto per i lettori di schermo", () => {
    const snapshot = withCharts(demoSnapshot("minimal"), [newBlock("chartCosts")]);
    const section = buildModel(snapshot, resources, "fromCover").pages.flat().find((entry) => entry.kind === "chart");
    if (!section || section.kind !== "chart" || section.chart.type !== "costs") throw new Error("manca il grafico");
    expect(section.chart.total).toBe("€ 6.500,00");
    expect(section.chart.caption).toBe("Una tantum · IVA esclusa");
    expect(section.chart.slices[0]).toMatchObject({ label: "Sviluppo sito web", amount: "€ 3.200,00", percent: "49%" });
    expect(section.a11y.rows).toHaveLength(5);
    expect(section.a11y.summary).toContain("totale € 6.500,00");
  });

  it("i quattro grafici vanno in stampa nei cinque template", async () => {
    for (const key of templateKeys) {
      const snapshot = withCharts(demoSnapshot(key), [newBlock("chartCosts"), { ...newBlock("chartCosts"), variant: "pie" } as QuoteBlock, newBlock("chartBars"), newBlock("chartTimeline"), newBlock("chartPayments")]);
      const pdf = await renderQuotePdf(snapshot, { images: new Map(), watermark: null });
      expect(pdf.byteLength).toBeGreaterThan(10_000);
    }
  }, 120_000);
});
