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
  "summary",
  "terms",
  "contacts",
] as const;
export type BlockType = (typeof blockTypes)[number];

export const blockLabel: Record<BlockType, string> = {
  cover: "Copertina",
  intro: "Introduzione",
  text: "Testo",
  image: "Immagine",
  services: "Servizi",
  options: "Opzioni",
  summary: "Riepilogo",
  terms: "Condizioni",
  contacts: "Contatti",
};

export const blockHint: Record<BlockType, string> = {
  cover: "Titolo, sottotitolo e immagine di apertura.",
  intro: "Il contesto e l'obiettivo della proposta.",
  text: "Un paragrafo libero, per esempio metodo o tempistiche.",
  image: "Una foto o un riferimento visivo, PNG o JPG.",
  services: "Le voci incluse nel totale.",
  options: "Voci facoltative, mostrate a parte e fuori dal totale.",
  summary: "Totali calcolati sul server, imposte e ricorrenze.",
  terms: "Validità, pagamenti e condizioni.",
  contacts: "I dati aziendali del Brand Kit e il referente.",
};

/** Blocks that can appear only once in a document. */
export const singletonBlocks: ReadonlySet<BlockType> = new Set(["cover", "summary", "contacts"]);

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

const base = { id: z.string().min(1).max(64), visible: z.boolean().default(true) };
const heading = plain(limits.heading, "Titolo sezione").default("");
const body = plain(limits.body, "Testo").default("");

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("cover"), title: heading, subtitle: plain(400, "Sottotitolo").default(""), imageAssetId: z.string().max(64).nullable().default(null) }),
  z.object({ ...base, type: z.literal("intro"), heading, body }),
  z.object({ ...base, type: z.literal("text"), heading, body }),
  z.object({ ...base, type: z.literal("image"), assetId: z.string().max(64).nullable().default(null), caption: plain(300, "Didascalia").default(""), alt: plain(200, "Testo alternativo").default("") }),
  z.object({ ...base, type: z.literal("services"), heading, items: z.array(lineSchema).max(limits.lines) }),
  z.object({ ...base, type: z.literal("options"), heading, body, items: z.array(lineSchema).max(limits.lines) }),
  z.object({ ...base, type: z.literal("summary"), heading, body }),
  z.object({ ...base, type: z.literal("terms"), heading, body }),
  z.object({ ...base, type: z.literal("contacts"), heading, body }),
]);

export type QuoteBlock = z.infer<typeof blockSchema>;
export type BlockOf<T extends BlockType> = Extract<QuoteBlock, { type: T }>;

export const documentSchema = z
  .object({
    blocks: z.array(blockSchema).min(1, { error: "Il preventivo deve avere almeno un blocco." }).max(limits.blocks, {
      error: `Al massimo ${limits.blocks} blocchi per preventivo.`,
    }),
    /** Withholding in basis points on the one-time taxable base. Informative, ordinario only. */
    withholdingBp: z.number().int().min(0).max(5000).default(0),
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
      return { id, visible: true, type, title: "", subtitle: "", imageAssetId: null };
    case "intro":
      return { id, visible: true, type, heading: "Introduzione", body: "" };
    case "text":
      return { id, visible: true, type, heading: "", body: "" };
    case "image":
      return { id, visible: true, type, assetId: null, caption: "", alt: "" };
    case "services":
      return { id, visible: true, type, heading: "Servizi inclusi", items: [] };
    case "options":
      return { id, visible: true, type, heading: "Opzioni facoltative", body: "", items: [] };
    case "summary":
      return { id, visible: true, type, heading: "Riepilogo", body: "" };
    case "terms":
      return { id, visible: true, type, heading: "Condizioni", body: defaults.terms ?? "" };
    case "contacts":
      return { id, visible: true, type, heading: "Contatti", body: "" };
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
    blocks: [cover, intro, services, newBlock("summary"), newBlock("terms", { terms: input.terms }), newBlock("contacts")],
    withholdingBp: 0,
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
