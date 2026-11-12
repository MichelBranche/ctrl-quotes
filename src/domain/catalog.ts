import { z } from "zod";
import { formatEuro } from "@/domain/money";
import { priceQuote, type BillingCycle, type PriceMode, type TaxProfile } from "@/domain/pricing";

export const catalogTypes = ["servizio", "prodotto", "pacchetto"] as const;
export type CatalogType = (typeof catalogTypes)[number];

export const catalogTypeLabel: Record<CatalogType, string> = {
  servizio: "Servizio",
  prodotto: "Prodotto",
  pacchetto: "Pacchetto",
};

export const catalogTypePlural: Record<CatalogType, string> = {
  servizio: "Servizi",
  prodotto: "Prodotti",
  pacchetto: "Pacchetti",
};

export const catalogBillings = ["una_tantum", "mensile", "annuale"] as const;
export type CatalogBilling = (typeof catalogBillings)[number];

export const catalogBillingLabel: Record<CatalogBilling, string> = {
  una_tantum: "Una tantum",
  mensile: "Mensile",
  annuale: "Annuale",
};

const billingSuffix: Record<CatalogBilling, string> = {
  una_tantum: "",
  mensile: " / mese",
  annuale: " / anno",
};

export function toPricingBilling(billing: CatalogBilling): BillingCycle {
  switch (billing) {
    case "una_tantum":
      return "one_time";
    case "mensile":
      return "monthly";
    case "annuale":
      return "yearly";
    default: {
      const exhaustive: never = billing;
      throw new Error(`Ricorrenza sconosciuta: ${String(exhaustive)}`);
    }
  }
}

/** Italian VAT rates offered in the UI. 0% requires a nature code. */
export const taxRateOptions = [
  { value: 2200, label: "22%" },
  { value: 1000, label: "10%" },
  { value: 500, label: "5%" },
  { value: 400, label: "4%" },
  { value: 0, label: "0%" },
] as const;

export const taxNatures = [
  { value: "N2.2", label: "N2.2 Non soggette" },
  { value: "N3.2", label: "N3.2 Non imponibili, cessioni intracomunitarie" },
  { value: "N4", label: "N4 Esenti" },
] as const;

const allowedRates: ReadonlySet<number> = new Set(taxRateOptions.map((option) => option.value));
const allowedNatures: ReadonlySet<string> = new Set(taxNatures.map((option) => option.value));

export function formatRate(bp: number): string {
  const value = bp / 100;
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace(".", ",")}%`;
}

/**
 * Parses an Italian or plain decimal amount into integer cents.
 * "1.200,50", "1200,5", "1200.50", "€ 90" are accepted. Returns null when invalid.
 */
export function parseEuroToCents(raw: string): number | null {
  const value = raw.replace(/€|\s/g, "").trim();
  if (value === "") return null;
  let normalized: string;
  if (value.includes(",")) {
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(value)) return null;
    normalized = value.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d{1,2}$/.test(value)) {
    normalized = value;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(value) || /^\d+$/.test(value)) {
    normalized = value.replace(/\./g, "");
  } else {
    return null;
  }
  const [whole = "0", fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 100_000_000_00) return null;
  return cents;
}

export function centsToInput(cents: number): string {
  return (cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatPrice(cents: number, billing: CatalogBilling): string {
  return `${formatEuro(cents)}${billingSuffix[billing]}`;
}

export const packageComponentSchema = z.object({
  itemId: z.string().min(1),
  quantityMilli: z
    .number()
    .int()
    .min(1, { error: "La quantità deve essere maggiore di zero." })
    .max(1_000_000, { error: "Quantità troppo alta." }),
});

export const catalogItemInputSchema = z
  .object({
    type: z.enum(catalogTypes, { error: "Scegli il tipo di elemento." }),
    name: z
      .string()
      .trim()
      .min(2, { error: "Il nome deve avere almeno 2 caratteri." })
      .max(120, { error: "Il nome può avere al massimo 120 caratteri." }),
    description: z
      .string()
      .trim()
      .max(1000, { error: "La descrizione può avere al massimo 1000 caratteri." })
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .default(null),
    unit: z
      .string()
      .trim()
      .max(30, { error: "L'unità può avere al massimo 30 caratteri." })
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .default(null),
    unitPriceCents: z
      .number({ error: "Inserisci un prezzo valido." })
      .int({ error: "Inserisci un prezzo valido." })
      .min(0, { error: "Il prezzo non può essere negativo." })
      .max(100_000_000_00, { error: "Prezzo troppo alto." }),
    priceMode: z.enum(["net", "gross"]).default("net"),
    taxRateBp: z.number().int().refine((value) => allowedRates.has(value), { error: "Aliquota IVA non valida." }),
    taxNature: z
      .string()
      .nullable()
      .default(null)
      .transform((value) => (value ? value : null)),
    billing: z.enum(catalogBillings, { error: "Ricorrenza non valida." }).default("una_tantum"),
    periods: z
      .number()
      .int()
      .min(1, { error: "La durata deve essere di almeno 1 periodo." })
      .max(120, { error: "La durata massima è 120 periodi." })
      .nullable()
      .default(null),
    optionalDefault: z.boolean().default(false),
    categoryId: z
      .string()
      .nullable()
      .default(null)
      .transform((value) => (value ? value : null)),
    components: z.array(packageComponentSchema).max(30, { error: "Un pacchetto può avere al massimo 30 voci." }).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.taxRateBp === 0 && (!value.taxNature || !allowedNatures.has(value.taxNature))) {
      ctx.addIssue({ code: "custom", path: ["taxNature"], message: "Con IVA 0% indica la natura dell'operazione." });
    }
    if (value.taxRateBp !== 0 && value.taxNature) {
      ctx.addIssue({ code: "custom", path: ["taxNature"], message: "La natura si indica solo con IVA 0%." });
    }
    if (value.billing === "una_tantum" && value.periods !== null) {
      ctx.addIssue({ code: "custom", path: ["periods"], message: "La durata vale solo per le voci ricorrenti." });
    }
    if (value.type === "pacchetto" && value.components.length === 0) {
      ctx.addIssue({ code: "custom", path: ["components"], message: "Aggiungi almeno una voce al pacchetto." });
    }
    if (value.type !== "pacchetto" && value.components.length > 0) {
      ctx.addIssue({ code: "custom", path: ["components"], message: "Solo i pacchetti hanno voci incluse." });
    }
    const ids = value.components.map((component) => component.itemId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["components"], message: "Ogni voce può comparire una sola volta nel pacchetto." });
    }
  });

export type CatalogItemInput = z.infer<typeof catalogItemInputSchema>;

export type PricedLine = {
  unitPriceCents: number;
  priceMode: PriceMode;
  taxRateBp: number;
  billing: CatalogBilling;
  quantityMilli?: number;
};

export type PricePreview = { netCents: number; vatCents: number; totalCents: number };

/** Price of one unit (or the given quantity) through the shared pricing engine. */
export function previewLine(line: PricedLine, taxProfile: TaxProfile): PricePreview {
  const result = priceQuote({
    lines: [
      {
        id: "preview",
        quantityMilli: line.quantityMilli ?? 1000,
        unitPriceCents: line.unitPriceCents,
        discountBp: 0,
        priceMode: line.priceMode,
        taxRateBp: line.taxRateBp,
        billing: toPricingBilling(line.billing),
      },
    ],
    taxProfile,
    withholdingBp: 0,
    stampDutyNote: false,
  });
  const bucket =
    line.billing === "mensile" ? result.monthly : line.billing === "annuale" ? result.yearly : result.oneTime;
  return { netCents: bucket.netCents, vatCents: bucket.vatCents, totalCents: bucket.totalCents };
}

export type ComponentPreview = {
  oneTime: PricePreview;
  monthly: PricePreview;
  yearly: PricePreview;
};

/** Sum of the package components, split by recurrence so monthly costs never blend into one-off totals. */
export function previewComponents(lines: PricedLine[], taxProfile: TaxProfile): ComponentPreview {
  const result = priceQuote({
    lines: lines.map((line, index) => ({
      id: `c${index}`,
      quantityMilli: line.quantityMilli ?? 1000,
      unitPriceCents: line.unitPriceCents,
      discountBp: 0,
      priceMode: line.priceMode,
      taxRateBp: line.taxRateBp,
      billing: toPricingBilling(line.billing),
    })),
    taxProfile,
    withholdingBp: 0,
    stampDutyNote: false,
  });
  const pick = (bucket: { netCents: number; vatCents: number; totalCents: number }) => ({
    netCents: bucket.netCents,
    vatCents: bucket.vatCents,
    totalCents: bucket.totalCents,
  });
  return { oneTime: pick(result.oneTime), monthly: pick(result.monthly), yearly: pick(result.yearly) };
}

export const categoryNameSchema = z
  .string()
  .trim()
  .min(2, { error: "Il nome della categoria deve avere almeno 2 caratteri." })
  .max(40, { error: "Il nome della categoria può avere al massimo 40 caratteri." });

export function parseQuantity(raw: string): number | null {
  const value = raw.replace(",", ".").trim();
  if (!/^\d+(\.\d{1,3})?$/.test(value)) return null;
  const milli = Math.round(Number(value) * 1000);
  return milli > 0 ? milli : null;
}
