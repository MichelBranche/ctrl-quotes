import type { BrandFont } from "@/domain/brand";
import type { ClientKind } from "@/domain/clients";
import { formatEuro } from "@/domain/money";
import type { MoneyBucket, PriceResult } from "@/domain/pricing";
import type { Fiscal, QuoteDocument, QuoteTotals } from "@/domain/quote-document";
import { formatPercentBp } from "@/domain/quote-document";

export const templateKeys = ["minimal", "editorial", "corporate", "bold"] as const;
export type TemplateKey = (typeof templateKeys)[number];

export function asTemplateKey(value: string | null | undefined): TemplateKey {
  return (templateKeys as readonly string[]).includes(value ?? "") ? (value as TemplateKey) : "minimal";
}

export const templateIdFor = (key: TemplateKey) => `tpl_${key}`;

/** Bumped whenever the renderers change in a way that alters an already stored snapshot. */
export const RENDERER_VERSION = "quotes-renderer@1";

/**
 * Everything needed to render a quote, frozen at a point in time.
 * Versions store it verbatim; drafts build it on the fly with the same shape.
 * Issuer data is only what the user typed in the Brand Kit: missing values stay missing.
 */
export type QuoteSnapshot = {
  rendererVersion: string;
  quote: {
    id: string;
    number: string | null;
    title: string;
    issuedAt: string;
    validUntil: string | null;
  };
  client: {
    name: string;
    kind: ClientKind;
    vatNumber: string | null;
    taxCode: string | null;
    address: string | null;
    email: string | null;
    contactName: string | null;
  } | null;
  issuer: {
    displayName: string;
    companyName: string | null;
    vatNumber: string | null;
    taxCode: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    ownerName: string | null;
    ownerEmail: string | null;
  };
  brand: {
    colorPrimary: string;
    colorSecondary: string;
    colorBackground: string;
    fontHeading: BrandFont;
    fontBody: BrandFont;
    /** Embedded so later Brand Kit changes never alter a stored version. */
    logo: { mime: string; dataBase64: string } | null;
  };
  template: TemplateKey;
  fiscal: Fiscal;
  document: QuoteDocument;
  totals: QuoteTotals;
  /** Image assets referenced by blocks. Quote images are never deleted, so the reference stays valid. */
  images: Array<{ id: string; sha256: string }>;
};

/** Stable JSON: keys sorted, so the hash only changes when the content does. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });

export function formatLongDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

export function logoSrc(snapshot: QuoteSnapshot): string | null {
  const logo = snapshot.brand.logo;
  return logo ? `data:${logo.mime};base64,${logo.dataBase64}` : null;
}

export function issuerLines(issuer: QuoteSnapshot["issuer"]): string[] {
  return [
    issuer.address,
    issuer.vatNumber ? `P. IVA ${issuer.vatNumber}` : null,
    issuer.taxCode ? `C.F. ${issuer.taxCode}` : null,
    issuer.email,
    issuer.phone,
    issuer.website?.replace(/^https?:\/\//, "") ?? null,
  ].filter((value): value is string => Boolean(value));
}

export function clientLines(client: QuoteSnapshot["client"]): string[] {
  if (!client) return [];
  return [
    client.contactName ? `Alla c.a. di ${client.contactName}` : null,
    client.address,
    client.vatNumber ? `P. IVA ${client.vatNumber}` : null,
    client.taxCode && !client.vatNumber ? `C.F. ${client.taxCode}` : null,
    client.email,
  ].filter((value): value is string => Boolean(value));
}

export type SummaryRow = { label: string; value: string; strong?: boolean };
export type SummaryGroup = { title: string; rows: SummaryRow[] };

function bucketRows(bucket: MoneyBucket, suffix: string): SummaryRow[] {
  const rows: SummaryRow[] = [{ label: "Imponibile", value: `${formatEuro(bucket.netCents)}${suffix}` }];
  for (const slice of bucket.byRate) {
    if (slice.taxRateBp > 0) rows.push({ label: `IVA ${formatPercentBp(slice.taxRateBp)}`, value: `${formatEuro(slice.vatCents)}${suffix}` });
  }
  rows.push({ label: "Totale", value: `${formatEuro(bucket.totalCents)}${suffix}`, strong: true });
  return rows;
}

function hasLines(result: PriceResult, key: "oneTime" | "monthly" | "yearly") {
  return result[key].byRate.length > 0;
}

/**
 * Summary in display order. One-time and recurring amounts are never summed together:
 * monthly and yearly costs get their own group.
 */
export function summaryGroups(totals: QuoteTotals): SummaryGroup[] {
  const groups: SummaryGroup[] = [];
  const main = totals.main;
  if (hasLines(main, "oneTime") || (!hasLines(main, "monthly") && !hasLines(main, "yearly"))) {
    const rows = bucketRows(main.oneTime, "");
    if (main.withholdingCents > 0) {
      rows.push({ label: "Ritenuta d'acconto", value: `- ${formatEuro(main.withholdingCents)}` });
      rows.push({ label: "Netto a pagare", value: formatEuro(main.netPayableCents), strong: true });
    }
    groups.push({ title: "Una tantum", rows });
  }
  if (hasLines(main, "monthly")) groups.push({ title: "Canone mensile", rows: bucketRows(main.monthly, " / mese") });
  if (hasLines(main, "yearly")) groups.push({ title: "Canone annuale", rows: bucketRows(main.yearly, " / anno") });
  return groups;
}

export function optionsTotalLabel(totals: QuoteTotals): string | null {
  const options = totals.options;
  const parts: string[] = [];
  if (hasLines(options, "oneTime")) parts.push(formatEuro(options.oneTime.totalCents));
  if (hasLines(options, "monthly")) parts.push(`${formatEuro(options.monthly.totalCents)} / mese`);
  if (hasLines(options, "yearly")) parts.push(`${formatEuro(options.yearly.totalCents)} / anno`);
  return parts.length ? parts.join(" + ") : null;
}

/** Headline amount: one-time total, or the first recurring bucket when the quote has only recurring lines. */
export function headlineTotal(totals: QuoteTotals): string {
  const main = totals.main;
  if (hasLines(main, "oneTime")) return formatEuro(main.oneTime.totalCents);
  if (hasLines(main, "monthly")) return `${formatEuro(main.monthly.totalCents)} / mese`;
  if (hasLines(main, "yearly")) return `${formatEuro(main.yearly.totalCents)} / anno`;
  return formatEuro(0);
}

export function billingSuffix(billing: string, periods: number | null): string {
  if (billing === "mensile") return periods ? ` / mese per ${periods} mesi` : " / mese";
  if (billing === "annuale") return periods ? ` / anno per ${periods} anni` : " / anno";
  return "";
}

/** Section numbers for templates that print them. Images are not numbered. */
export function sectionNumbers(blocks: ReadonlyArray<{ type: string }>): number[] {
  let current = 0;
  return blocks.map((block) => (block.type === "image" ? current : (current += 1)));
}
