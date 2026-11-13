import { describe, expect, it } from "vitest";
import { buildModel, emptyPlan, mayBreak, type Resources } from "@/components/quote-render/model";
import { computeTotals, newBlock, type QuoteBlock } from "@/domain/quote-document";
import { templateKeys } from "@/domain/templates";
import { improves, jumpedRows, nextStep, orphans, pageGaps, readPages, tallTags, waste, withTall, type LayoutNode, type PrintPage } from "@/server/pdf/fit";
import { pdfViewProps } from "@/server/pdf/kit-pdf";
import { fitPages, renderQuotePdfPlan } from "@/server/pdf/quote-pdf";
import { demoSnapshot } from "./fixtures/template-demo";

const page = (label: string, items: Array<[string | null, number, number]>, bottom = 800): PrintPage => ({ label, top: 40, bottom, items: items.map(([tag, top, end]) => ({ tag, top, bottom: end })) });
const options = { minGap: 150, minStart: 110 };
const col = (type: Parameters<typeof newBlock>[0], id: string, extra: Record<string, unknown> = {}) => ({ ...newBlock(type), id, ...extra }) as QuoteBlock;

describe("lettura dell'impaginazione", () => {
  it("legge pagine, etichette e solo gli elementi che scorrono", () => {
    const layout: LayoutNode = {
      children: [
        {
          props: { cqPage: "Pagina 2" },
          box: { top: 0, height: 842, paddingTop: 30, paddingBottom: 34 },
          children: [
            { props: { fixed: true }, box: { top: 30, height: 40 } },
            { props: {}, style: { position: "absolute" }, box: { top: 0, height: 10 } },
            { props: { cqPrint: "b-intro" }, box: { top: 80, height: 100 } },
            { props: {}, box: { top: 190, height: 20 } },
          ],
        },
      ],
    };
    expect(readPages(layout)).toEqual([
      { label: "Pagina 2", top: 30, bottom: 808, items: [{ tag: "b-intro", top: 80, bottom: 180 }, { tag: null, top: 190, bottom: 210 }] },
    ]);
    expect(readPages(null)).toEqual([]);
  });

  it("misura lo spazio vuoto solo dove una pagina continua nella successiva", () => {
    const pages = [page("Pagina 2", [["a", 40, 300]]), page("Pagina 2", [["row:r1", 40, 400]]), page("Pagina 3", [["b", 40, 100]])];
    expect(pageGaps(pages)).toEqual([{ page: 0, gap: 500, next: { tag: "row:r1", top: 40, bottom: 400 } }]);
    expect(waste(pages)).toBe(500);
    expect(jumpedRows(pages, 150)).toEqual(["row:r1"]);
    // A small gap, or a block that is not a row, is not worth stacking.
    expect(jumpedRows([page("Pagina 2", [["a", 40, 700]]), page("Pagina 2", [["row:r1", 40, 400]])], 150)).toEqual([]);
    expect(jumpedRows([page("Pagina 2", [["a", 40, 300]]), page("Pagina 2", [["b-terms", 40, 400]])], 150)).toEqual([]);
  });

  it("trova dalla sonda gli elementi più alti di una pagina e li lascia spezzare", () => {
    const probe = [page("Pagina 3", [["a", 40, 600], ["b-terms", 600, 800]]), page("Pagina 3", [["b-terms", 40, 800]]), page("Pagina 3", [["b-terms", 40, 100], ["row:r9", 100, 300]])];
    expect(tallTags(probe)).toEqual(["b-terms"]);
    const plan = withTall({ ...emptyPlan, probe: true }, ["b-terms", "row:r2"]);
    expect([...plan.tall]).toEqual(["b-terms"]);
    expect([...plan.stack]).toEqual(["row:r2"]);
    expect(plan.probe).toBe(false);
    expect(mayBreak(plan, "b-terms")).toBe(true);
    expect(mayBreak(plan, "b-intro")).toBe(false);
    expect(mayBreak({ ...emptyPlan, probe: true }, "b-intro")).toBe(true);
  });

  it("non lascia il titolo di un blocco lungo da solo in fondo alla pagina", () => {
    const pages = [page("Pagina 3", [["a", 40, 720], ["b-terms", 720, 800]]), page("Pagina 3", [["b-terms", 40, 800]])];
    expect(orphans(pages, new Set(["b-terms"]), 110)).toEqual(["b-terms"]);
    expect(orphans(pages, new Set(), 110)).toEqual([]);
    const step = nextStep({ ...emptyPlan, tall: new Set(["b-terms"]) }, pages, new Set(), options);
    expect(step?.trial).toBeNull();
    expect([...(step?.plan.fresh ?? [])]).toEqual(["b-terms"]);
  });

  it("prova a impilare una riga saltata una sola volta", () => {
    const pages = [page("Pagina 2", [["a", 40, 300]]), page("Pagina 2", [["row:r1", 40, 400]])];
    const step = nextStep(emptyPlan, pages, new Set(), options);
    expect(step?.trial).toBe("row:r1");
    expect([...(step?.plan.stack ?? [])]).toEqual(["row:r1"]);
    expect(nextStep(emptyPlan, pages, new Set(["row:r1"]), options)).toBeNull();
  });

  it("tiene una prova solo se libera spazio senza aggiungere pagine", () => {
    const before = [page("Pagina 2", [["a", 40, 300]]), page("Pagina 2", [["row:r1", 40, 400]])];
    const better = [page("Pagina 2", [["a", 40, 300], ["t", 300, 700]]), page("Pagina 2", [["c", 40, 400]])];
    const longer = [...better, page("Pagina 2", [["d", 40, 100]])];
    expect(improves(before, better, 120)).toBe(true);
    expect(improves(before, longer, 120)).toBe(false);
    expect(improves(before, before, 120)).toBe(false);
  });
});

describe("kit PDF", () => {
  it("non passa chiavi vuote: un `fixed` indefinito disattiverebbe wrap={false}", () => {
    expect(pdfViewProps({ fixed: undefined, wrap: false })).toEqual({ wrap: false });
    expect("fixed" in pdfViewProps({ wrap: undefined })).toBe(false);
    expect(pdfViewProps({ fixed: true, breakBefore: true, minPresenceAhead: 40, tag: "b-1" })).toEqual({ fixed: true, break: true, minPresenceAhead: 40, cqPrint: "b-1" });
  });
});

describe("piano di stampa", () => {
  const resources: Resources = { logo: null, photo: () => null, image: () => null, watermark: null, versionLabel: null };

  it("una riga impilata stampa i suoi blocchi uno sotto l'altro, nello stesso ordine e numerazione", () => {
    const snapshot = demoSnapshot("minimal");
    const blocks = [...snapshot.document.blocks, col("text", "x1", { heading: "Uno", body: "A", col: { row: "r", span: 3 } }), col("text", "x2", { heading: "Due", body: "B", col: { row: "r", span: 3 } })];
    const document = { ...snapshot.document, blocks };
    const s = { ...snapshot, document, totals: computeTotals(document, snapshot.fiscal) };
    const rowed = buildModel(s, resources, "fromIntro").pages.flat();
    const stacked = buildModel(s, resources, "fromIntro", { ...emptyPlan, stack: new Set(["row:r"]) }).pages.flat();
    expect(rowed.some((section) => section.id === "row:r")).toBe(true);
    expect(stacked.some((section) => section.id === "row:r")).toBe(false);
    const numbers = (sections: typeof rowed) => sections.flatMap((section) => (section.kind === "row" ? section.columns.map((column) => column.section) : [section])).map((section) => [section.id, section.no]);
    expect(numbers(stacked)).toEqual(numbers(rowed));
  });

  it("si ferma dopo una sola resa quando non c'è niente da migliorare", async () => {
    let renders = 0;
    const result = await fitPages(async () => {
      renders += 1;
      return { buffer: Buffer.from("x"), pages: [page("Pagina 2", [["a", 40, 700]])], overflow: false };
    });
    expect(renders).toBe(1);
    expect(result.plan).toBe(emptyPlan);
  });

  it("quando un blocco intero non entra in pagina fa la sonda e lo lascia spezzare", async () => {
    const plans: string[] = [];
    const result = await fitPages(async (plan) => {
      plans.push(plan.probe ? "probe" : [...plan.tall].join(","));
      if (plan.probe) return { buffer: Buffer.from("p"), pages: [page("Pagina 3", [["b-terms", 40, 800]]), page("Pagina 3", [["b-terms", 40, 300]])], overflow: false };
      if (plan.tall.has("b-terms")) return { buffer: Buffer.from("ok"), pages: [page("Pagina 3", [["a", 40, 200], ["b-terms", 200, 800]]), page("Pagina 3", [["b-terms", 40, 500]])], overflow: false };
      return { buffer: null, pages: [], overflow: true };
    });
    expect(plans).toEqual(["", "probe", "b-terms"]);
    expect(result.buffer?.toString()).toBe("ok");
  });
});

describe("PDF reali", () => {
  const longTerms = Array.from({ length: 14 }, (_, index) => `Punto ${index + 1}. Il preventivo resta valido trenta giorni dalla data di emissione. Eventuali modifiche al perimetro vengono concordate per iscritto e possono cambiare tempi e importi.`).join("\n\n");

  it("Condizioni più lunghe di una pagina si spezzano invece di rompere il PDF, in tutti i template", async () => {
    for (const key of templateKeys) {
      const snapshot = demoSnapshot(key);
      const blocks = snapshot.document.blocks.map((block) => (block.type === "terms" ? ({ ...block, body: longTerms } as QuoteBlock) : block));
      const document = { ...snapshot.document, blocks };
      const terms = blocks.find((block) => block.type === "terms");
      const result = await renderQuotePdfPlan({ ...snapshot, document, totals: computeTotals(document, snapshot.fiscal) }, { images: new Map(), watermark: null });
      expect(result.buffer.subarray(0, 4).toString(), key).toBe("%PDF");
      expect(result.plan.tall.has(terms?.id ?? ""), key).toBe(true);
      // Nothing runs past the foot of a page (Bold's last dark band bleeds into the 30 pt margin on purpose).
      for (const printed of result.pages) for (const item of printed.items) expect(item.bottom, key).toBeLessThanOrEqual(printed.bottom + 31);
    }
  }, 120_000);

  it("una riga che salterebbe lasciando mezza pagina vuota viene impilata", async () => {
    const snapshot = demoSnapshot("minimal");
    const blocks: QuoteBlock[] = [];
    for (const block of snapshot.document.blocks) {
      blocks.push(block);
      if (block.type === "services") {
        blocks.push(col("text", "t1", { heading: "Metodo", body: "Lavoriamo in tre fasi brevi: ascolto, progetto e messa online. Ogni fase si chiude con una revisione insieme, così sai sempre a che punto siamo e cosa arriva dopo.\n\nIl budget segue lo stesso ordine: la parte più grande va allo sviluppo del sito, il resto a design, strategia e contenuti.", col: { row: "r1", span: 3 } }));
        blocks.push(col("chartCosts", "c1", { col: { row: "r1", span: 3 } }));
      }
    }
    const document = { ...snapshot.document, blocks };
    const result = await renderQuotePdfPlan({ ...snapshot, document, totals: computeTotals(document, snapshot.fiscal) }, { images: new Map(), watermark: null });
    expect([...result.plan.stack]).toEqual(["row:r1"]);
  }, 60_000);
});
