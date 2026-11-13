import { z } from "zod";
import { catalogBillings, toPricingBilling, type CatalogBilling } from "@/domain/catalog";
import { createId } from "@/domain/ids";
import { priceQuote, type PriceMode, type PriceResult, type TaxProfile } from "@/domain/pricing";

/**
 * The editable body of a quote: an ordered list of typed blocks.
 * Content is plain text only. No HTML, no markdown, no scripts: the renderers print text nodes.
 */

export const blockTypes = [
  "cover",
  "intro",
  "text",
  "image",
  "services",
  "options",
  "highlights",
  "summary",
  "timeline",
  "terms",
  "contacts",
  "chartCosts",
  "chartBars",
  "chartTimeline",
  "chartPayments",
] as const;
export type BlockType = (typeof blockTypes)[number];

export const blockLabel: Record<BlockType, string> = {
  cover: "Copertina",
  intro: "Introduzione",
  text: "Testo",
  image: "Immagine",
  services: "Servizi",
  options: "Opzioni",
  highlights: "Vantaggi",
  summary: "Riepilogo",
  timeline: "Tempistiche",
  terms: "Condizioni",
  contacts: "Contatti",
  chartCosts: "Ripartizione costi",
  chartBars: "Barre dei costi",
  chartTimeline: "Timeline",
  chartPayments: "Piano pagamenti",
};

export const blockHint: Record<BlockType, string> = {
  cover: "Titolo, sottotitolo e immagine di apertura.",
  intro: "Il contesto e l'obiettivo della proposta.",
  text: "Un paragrafo libero, per esempio metodo o tempistiche.",
  image: "Una foto o un riferimento visivo, PNG o JPG.",
  services: "Le voci incluse nel totale.",
  options: "Voci facoltative, mostrate a parte e fuori dal totale.",
  highlights: "Da due a quattro punti di forza della proposta, con un'icona.",
  summary: "Totali calcolati sul server, imposte e ricorrenze.",
  timeline: "Le fasi del progetto, dalla prima all'ultima.",
  terms: "Validità, pagamenti e condizioni.",
  contacts: "I dati aziendali del Brand Kit e il referente.",
  chartCosts: "Torta o ciambella dei costi, calcolata dai servizi.",
  chartBars: "I costi per voce o per sezione, in barre.",
  chartTimeline: "Le fasi delle Tempistiche su una linea del tempo.",
  chartPayments: "Le rate delle Condizioni, in euro sul totale.",
};

/** Chart blocks: drawn from the quote data, never typed in. */
export const chartBlockTypes = ["chartCosts", "chartBars", "chartTimeline", "chartPayments"] as const;
export type ChartBlockType = (typeof chartBlockTypes)[number];

export const chartHeading: Record<ChartBlockType, string> = {
  chartCosts: "Ripartizione dei costi",
  chartBars: "Dove va il budget",
  chartTimeline: "Piano di lavoro",
  chartPayments: "Piano dei pagamenti",
};

/** Blocks that can appear only once in a document. */
export const singletonBlocks: ReadonlySet<BlockType> = new Set(["cover", "summary", "timeline", "contacts"]);

export const limits = {
  blocks: 40,
  lines: 200,
  title: 140,
  heading: 120,
  body: 6000,
  lineName: 160,
  lineDescription: 1000,
} as const;

const plain = (max: number, label: string) =>
  z
    .string()
    .max(max, { error: `${label}: massimo ${max} caratteri.` })
    // Control characters other than newline and tab are dropped, never rendered.
    .transform((value) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ""));

const allowedRates = new Set([2200, 1000, 500, 400, 0]);

export const lineSchema = z
  .object({
    id: z.string().min(1).max(64),
    catalogItemId: z.string().max(64).nullable().default(null),
    name: plain(limits.lineName, "Nome voce").pipe(z.string().trim().min(1, { error: "Ogni voce deve avere un nome." })),
    description: plain(limits.lineDescription, "Descrizione voce").default(""),
    unit: plain(30, "Unità").default(""),
    quantityMilli: z
      .number({ error: "Quantità non valida." })
      .int({ error: "Quantità non valida." })
      .min(1, { error: "La quantità deve essere maggiore di zero." })
      .max(1_000_000_000, { error: "Quantità troppo alta." }),
    unitPriceCents: z
      .number({ error: "Prezzo non valido." })
      .int({ error: "Prezzo non valido." })
      .min(0, { error: "Il prezzo non può essere negativo." })
      .max(100_000_000_00, { error: "Prezzo troppo alto." }),
    priceMode: z.enum(["net", "gross"]),
    taxRateBp: z.number().int().refine((value) => allowedRates.has(value), { error: "Aliquota IVA non valida." }),
    taxNature: z.string().max(10).nullable().default(null),
    discountBp: z
      .number()
      .int()
      .min(0, { error: "Lo sconto non può essere negativo." })
      .max(10000, { error: "Lo sconto massimo è 100%." })
      .default(0),
    billing: z.enum(catalogBillings),
    periods: z.number().int().min(1).max(120).nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.billing === "una_tantum" && value.periods !== null) {
      ctx.addIssue({ code: "custom", path: ["periods"], message: "La durata vale solo per le voci ricorrenti." });
    }
  });

export type QuoteLine = z.infer<typeof lineSchema>;

const base = {
  id: z.string().min(1).max(64),
  visible: z.boolean().default(true),
  /** Content locked against edits (editor only: the PDF prints it as usual). Absent means unlocked. */
  locked: z.boolean().optional(),
  /** Side by side placement: consecutive blocks with the same row form a row, widths in sixths. Absent means full width. */
  col: z.object({ row: z.string().min(1).max(64), span: z.union([z.literal(2), z.literal(3), z.literal(4)]) }).optional(),
};
const heading = plain(limits.heading, "Titolo sezione").default("");
const body = plain(limits.body, "Testo").default("");

export const highlightIcons = ["visibility", "contacts", "value", "performance", "control", "results"] as const;
export type HighlightIcon = (typeof highlightIcons)[number];
export const highlightIconLabel: Record<HighlightIcon, string> = {
  visibility: "Visibilità",
  contacts: "Contatti",
  value: "Valore",
  performance: "Performance",
  control: "Controllo",
  results: "Risultati",
};

const highlightSchema = z.object({
  id: z.string().min(1).max(64),
  icon: z.enum(highlightIcons).default("visibility"),
  title: plain(80, "Titolo vantaggio").default(""),
  body: plain(300, "Testo vantaggio").default(""),
});
export type Highlight = z.infer<typeof highlightSchema>;

const stepSchema = z.object({
  id: z.string().min(1).max(64),
  label: plain(60, "Periodo").default(""),
  title: plain(140, "Attività").default(""),
});
export type TimelineStep = z.infer<typeof stepSchema>;

/**
 * Options shared by every chart block. All optional with a default, so documents saved before the
 * charts existed parse exactly as before and charts saved now keep working if a field is added.
 */
const chartFields = {
  heading,
  /** Costs: full pie or ring with the total in the middle. */
  variant: z.enum(["donut", "pie"]).default("donut"),
  /** Costs and bars: one slice per service line (same names merged) or per services section. */
  group: z.enum(["line", "section"]).default("line"),
  /** "auto": taxable base for costs, VAT included for instalments. Ignored without VAT. */
  vat: z.enum(["auto", "net", "gross"]).default("auto"),
  legend: z.boolean().default(true),
  amounts: z.boolean().default(true),
  percents: z.boolean().default(true),
};

export const blockSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("cover"),
    title: heading,
    subtitle: plain(400, "Sottotitolo").default(""),
    imageAssetId: z.string().max(64).nullable().default(null),
    /** Short line under the issuer name, e.g. "Design / Sviluppo / Strategia". Never filled in for the user. */
    tagline: plain(120, "Descrizione dello studio").default(""),
    /** Project label in the cover footer. Empty: the quote title. */
    project: plain(80, "Progetto").default(""),
  }),
  z.object({
    ...base,
    type: z.literal("intro"),
    heading,
    body,
    /** Large editorial headline next to the body, used by the templates that print one. */
    lead: plain(200, "Frase di apertura").default(""),
    quote: plain(300, "Citazione").default(""),
    points: z.array(plain(200, "Obiettivo")).max(8).default([]),
  }),
  z.object({ ...base, type: z.literal("text"), heading, body }),
  z.object({ ...base, type: z.literal("image"), assetId: z.string().max(64).nullable().default(null), caption: plain(300, "Didascalia").default(""), alt: plain(200, "Testo alternativo").default("") }),
  z.object({ ...base, type: z.literal("services"), heading, items: z.array(lineSchema).max(limits.lines) }),
  z.object({ ...base, type: z.literal("options"), heading, body, items: z.array(lineSchema).max(limits.lines) }),
  z.object({ ...base, type: z.literal("highlights"), heading, items: z.array(highlightSchema).max(4).default([]) }),
  z.object({
    ...base,
    type: z.literal("summary"),
    heading,
    body,
    /** Cost breakdown chart, computed from the visible services, in the templates that have one. */
    breakdown: z.boolean().default(true),
  }),
  z.object({ ...base, type: z.literal("timeline"), heading, steps: z.array(stepSchema).max(8).default([]) }),
  z.object({
    ...base,
    type: z.literal("terms"),
    heading,
    body,
    payment: plain(1000, "Pagamento").default(""),
    notes: plain(1000, "Note").default(""),
  }),
  z.object({ ...base, type: z.literal("contacts"), heading, body }),
  z.object({ ...base, type: z.literal("chartCosts"), ...chartFields }),
  z.object({ ...base, type: z.literal("chartBars"), ...chartFields }),
  z.object({ ...base, type: z.literal("chartTimeline"), ...chartFields }),
  z.object({ ...base, type: z.literal("chartPayments"), ...chartFields }),
]);

export type QuoteBlock = z.infer<typeof blockSchema>;
export type BlockOf<T extends BlockType> = Extract<QuoteBlock, { type: T }>;

/**
 * Presentation choices that travel with the quote. `accent`: the template colour, the Brand Kit
 * secondary colour or a custom hex. `photos`: chosen photo option per template key, so switching
 * template and back keeps the choice.
 */
export const styleSchema = z.object({
  accent: z
    .union([z.literal("template"), z.literal("brand"), z.string().regex(/^#[0-9A-Fa-f]{6}$/, { error: "Colore non valido." })])
    .default("template"),
  photos: z.record(z.string().max(20), z.string().max(40)).default({}),
});
export type DocumentStyle = z.infer<typeof styleSchema>;

export const documentSchema = z
  .object({
    blocks: z.array(blockSchema).min(1, { error: "Il preventivo deve avere almeno un blocco." }).max(limits.blocks, {
      error: `Al massimo ${limits.blocks} blocchi per preventivo.`,
    }),
    /** Withholding in basis points on the one-time taxable base. Informative, ordinario only. */
    withholdingBp: z.number().int().min(0).max(5000).default(0),
    style: styleSchema.default({ accent: "template", photos: {} }),
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    let lines = 0;
    const seen = new Map<BlockType, number>();
    for (const block of value.blocks) {
      if (ids.has(block.id)) ctx.addIssue({ code: "custom", path: ["blocks"], message: "Due blocchi hanno lo stesso identificativo." });
      ids.add(block.id);
      seen.set(block.type, (seen.get(block.type) ?? 0) + 1);
      if (block.type === "services" || block.type === "options") lines += block.items.length;
    }
    for (const type of singletonBlocks) {
      if ((seen.get(type) ?? 0) > 1) {
        ctx.addIssue({ code: "custom", path: ["blocks"], message: `Il blocco ${blockLabel[type]} può comparire una sola volta.` });
      }
    }
    if (lines > limits.lines) {
      ctx.addIssue({ code: "custom", path: ["blocks"], message: `Al massimo ${limits.lines} voci per preventivo.` });
    }
  });

export type QuoteDocument = z.infer<typeof documentSchema>;

/** Everything the draft autosave sends. Meta lives on the quote row, the body in quote_drafts. */
export const draftInputSchema = z.object({
  revision: z.number().int().min(1),
  title: z
    .string()
    .trim()
    .min(2, { error: "Il titolo deve avere almeno 2 caratteri." })
    .max(limits.title, { error: `Il titolo può avere al massimo ${limits.title} caratteri.` }),
  clientId: z.string().max(64).nullable(),
  templateId: z.string().max(64),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Data di validità non valida." })
    .nullable(),
  document: documentSchema,
});

export type DraftInput = z.infer<typeof draftInputSchema>;

export const createQuoteSchema = z.object({
  clientId: z.string().min(1, { error: "Scegli un cliente." }).max(64),
  templateId: z.string().max(64).nullable().default(null),
  title: z
    .string()
    .trim()
    .min(2, { error: "Il titolo deve avere almeno 2 caratteri." })
    .max(limits.title, { error: `Il titolo può avere al massimo ${limits.title} caratteri.` }),
  validityDays: z.number().int().min(1, { error: "La validità minima è 1 giorno." }).max(365, { error: "La validità massima è 365 giorni." }).nullable().default(null),
  catalogItemIds: z.array(z.string().min(1).max(64)).max(50, { error: "Al massimo 50 voci alla creazione." }).default([]),
  intro: plain(2000, "Introduzione").default(""),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

export function newBlock(type: BlockType, defaults: { terms?: string | null } = {}): QuoteBlock {
  const id = createId();
  switch (type) {
    case "cover":
      return { id, visible: true, type, title: "", subtitle: "", imageAssetId: null, tagline: "", project: "" };
    case "intro":
      return { id, visible: true, type, heading: "Il progetto", body: "", lead: "", quote: "", points: [] };
    case "text":
      return { id, visible: true, type, heading: "", body: "" };
    case "image":
      return { id, visible: true, type, assetId: null, caption: "", alt: "" };
    case "services":
      return { id, visible: true, type, heading: "Servizi inclusi", items: [] };
    case "options":
      return { id, visible: true, type, heading: "Opzioni facoltative", body: "", items: [] };
    case "highlights":
      return { id, visible: true, type, heading: "Vantaggi", items: [] };
    case "summary":
      return { id, visible: true, type, heading: "Riepilogo economico", body: "", breakdown: true };
    case "timeline":
      return { id, visible: true, type, heading: "Tempistiche", steps: [] };
    case "terms":
      return { id, visible: true, type, heading: "Condizioni", body: defaults.terms ?? "", payment: "", notes: "" };
    case "contacts":
      return { id, visible: true, type, heading: "Contatti e accettazione", body: "" };
    case "chartCosts":
    case "chartBars":
    case "chartTimeline":
    case "chartPayments":
      return { id, visible: true, type, heading: chartHeading[type], variant: "donut", group: "line", vat: "auto", legend: true, amounts: true, percents: true };
    default: {
      const exhaustive: never = type;
      throw new Error(`Blocco sconosciuto: ${String(exhaustive)}`);
    }
  }
}

export type CatalogSource = {
  id: string;
  name: string;
  description: string | null;
  unit: string | null;
  unitPriceCents: number;
  priceMode: PriceMode;
  taxRateBp: number;
  taxNature: string | null;
  billing: CatalogBilling;
  periods: number | null;
};

/** Copies catalog data into the quote: later catalog edits never change existing quotes. */
export function lineFromCatalog(item: CatalogSource): QuoteLine {
  return {
    id: createId(),
    catalogItemId: item.id,
    name: item.name,
    description: item.description ?? "",
    unit: item.unit ?? "",
    quantityMilli: 1000,
    unitPriceCents: item.unitPriceCents,
    priceMode: item.priceMode,
    taxRateBp: item.taxRateBp,
    taxNature: item.taxNature,
    discountBp: 0,
    billing: item.billing,
    periods: item.billing === "una_tantum" ? null : item.periods,
  };
}

export function blankLine(defaults: { taxRateBp: number; priceMode: PriceMode }): QuoteLine {
  return {
    id: createId(),
    catalogItemId: null,
    name: "Nuova voce",
    description: "",
    unit: "",
    quantityMilli: 1000,
    unitPriceCents: 0,
    priceMode: defaults.priceMode,
    taxRateBp: defaults.taxRateBp,
    taxNature: defaults.taxRateBp === 0 ? "N2.2" : null,
    discountBp: 0,
    billing: "una_tantum",
    periods: null,
  };
}

export function initialDocument(input: {
  title: string;
  clientName: string;
  intro: string;
  lines: QuoteLine[];
  terms: string | null;
}): QuoteDocument {
  const cover = newBlock("cover") as BlockOf<"cover">;
  cover.title = input.title;
  cover.subtitle = `Proposta per ${input.clientName}`;
  const intro = newBlock("intro") as BlockOf<"intro">;
  intro.body = input.intro;
  const services = newBlock("services") as BlockOf<"services">;
  services.items = input.lines;
  return {
    blocks: [cover, intro, services, newBlock("summary"), newBlock("timeline"), newBlock("terms", { terms: input.terms }), newBlock("contacts")],
    withholdingBp: 0,
    style: { accent: "template", photos: {} },
  };
}

export type Fiscal = { taxProfile: TaxProfile; stampDutyNote: boolean };

export type QuoteTotals = {
  /** Lines of visible services blocks: the commercial total. */
  main: PriceResult;
  /** Lines of visible options blocks, priced separately and never added to the main total. */
  options: PriceResult;
  lineCount: number;
};

function toPriceLines(lines: QuoteLine[]) {
  return lines.map((line) => ({
    id: line.id,
    quantityMilli: line.quantityMilli,
    unitPriceCents: line.unitPriceCents,
    discountBp: line.discountBp,
    priceMode: line.priceMode,
    taxRateBp: line.taxRateBp,
    billing: toPricingBilling(line.billing),
  }));
}

export function linesOf(document: QuoteDocument, type: "services" | "options"): QuoteLine[] {
  return document.blocks.flatMap((block) => (block.type === type && block.visible ? block.items : []));
}

/** Single pricing path for editor, preview, versions and PDF. Runs on the server for anything persisted. */
export function computeTotals(document: QuoteDocument, fiscal: Fiscal): QuoteTotals {
  const main = linesOf(document, "services");
  const options = linesOf(document, "options");
  const withholdingBp = fiscal.taxProfile === "ordinario" ? document.withholdingBp : 0;
  return {
    main: priceQuote({ lines: toPriceLines(main), taxProfile: fiscal.taxProfile, withholdingBp, stampDutyNote: fiscal.stampDutyNote }),
    options: priceQuote({ lines: toPriceLines(options), taxProfile: fiscal.taxProfile, withholdingBp: 0, stampDutyNote: false }),
    lineCount: main.length + options.length,
  };
}

/** Net of one line after discount, before VAT, for display in tables. */
export function lineNetCents(line: QuoteLine, taxProfile: TaxProfile): number {
  const single = priceQuote({
    lines: toPriceLines([line]),
    taxProfile,
    withholdingBp: 0,
    stampDutyNote: false,
  });
  const bucket = line.billing === "mensile" ? single.monthly : line.billing === "annuale" ? single.yearly : single.oneTime;
  return bucket.netCents;
}

export function formatQuantity(milli: number): string {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 }).format(milli / 1000);
}

export function formatPercentBp(bp: number): string {
  return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(bp / 100)}%`;
}

/** Parses stored JSON defensively. A corrupt draft never crashes the editor. */
export function parseDocument(raw: string): QuoteDocument | null {
  try {
    const parsed = documentSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Asset ids referenced by image and cover blocks. */
export function referencedAssets(document: QuoteDocument): string[] {
  const ids = new Set<string>();
  for (const block of document.blocks) {
    if (block.type === "image" && block.assetId) ids.add(block.assetId);
    if (block.type === "cover" && block.imageAssetId) ids.add(block.imageAssetId);
  }
  return [...ids];
}

/**
 * A new block as the editors add it: with starter text the user types over, so it shows on the
 * sheet straight away. A block with nothing in it would print nothing (an empty list of points,
 * phases or options is skipped by every template). Prices start at zero: never an invented amount.
 */
export function starterBlock(type: BlockType, defaults: { terms?: string | null; taxRateBp: number; priceMode: PriceMode }): QuoteBlock {
  const block = newBlock(type, defaults);
  switch (block.type) {
    case "intro":
      return { ...block, body: "Racconta in poche righe il contesto del cliente e l'obiettivo della proposta." };
    case "text":
      return { ...block, heading: "Nuovo testo", body: "Scrivi qui il testo del paragrafo." };
    case "services":
    case "options":
      return { ...block, items: [blankLine(defaults)] };
    case "highlights":
      return {
        ...block,
        items: (["visibility", "value", "results"] as const).map((icon, index) => ({
          id: createId(),
          icon,
          title: `Punto di forza ${index + 1}`,
          body: "Spiega in una frase cosa ottiene il cliente.",
        })),
      };
    case "timeline":
      return {
        ...block,
        steps: ["Fase 1", "Fase 2", "Fase 3"].map((label) => ({ id: createId(), label, title: "Descrivi l'attività di questa fase" })),
      };
    case "terms":
      return block.body.trim() ? block : { ...block, body: "Scrivi qui validità, tempi di pagamento e condizioni della proposta." };
    default:
      return block;
  }
}
