import { contrastRatio, readableOn } from "@/domain/brand";
import {
  documentSchema,
  formatPercentBp,
  formatQuantity,
  lineNetCents,
  type BlockOf,
  type HighlightIcon,
  type QuoteBlock,
  type QuoteLine,
} from "@/domain/quote-document";
import type { MoneyBucket } from "@/domain/pricing";
import { billingSuffix, formatLongDate, type QuoteSnapshot } from "@/domain/quote-snapshot";
import { asTemplateKey, photoOptionFor, templateInfo, type PhotoOption, type PhotoSlot, type TemplateKey } from "@/domain/templates";

/**
 * Everything a template prints, derived once from the snapshot. Templates only lay it out:
 * no pricing, no formatting rules and no fallback copy live in the template files.
 * Missing issuer or client data stays missing; placeholders are explicit and neutral.
 */

const number = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });
const integer = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: "always" });

/** "€ 1.500,00", the notation of every mockup. */
export function euro(cents: number): string {
  const sign = cents < 0 ? "- " : "";
  return `${sign}€ ${number.format(Math.abs(cents) / 100)}`;
}

/** "€ 7.930" for round amounts, full precision otherwise. Display only, never used for sums. */
export function euroShort(cents: number): string {
  if (cents % 100 !== 0) return euro(cents);
  const sign = cents < 0 ? "- " : "";
  return `${sign}€ ${integer.format(Math.abs(cents) / 100)}`;
}

const shortDate = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" });

function formatShortDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : shortDate.format(date).replace(/\//g, ".");
}

export type LogoInfo = { src: string; tone: "light" | "dark" | null; aspect: number | null };

export type Resources = {
  logo: LogoInfo | null;
  /** URL (web) or file path (PDF) of a shipped template photo. */
  photo: (key: TemplateKey, option: PhotoOption, slot: PhotoSlot) => string | null;
  /** URL (web) or data source (PDF) of an uploaded quote image. */
  image: (assetId: string) => string | null;
  watermark: string | null;
  versionLabel: string | null;
};

export type Row = {
  id: string;
  name: string;
  description: string;
  quantity: string;
  price: string;
  vat: string;
  net: string;
  tags: string[];
};

export type MoneyGroup = {
  key: "oneTime" | "monthly" | "yearly";
  title: string;
  caption: string;
  suffix: string;
  rows: Array<{ label: string; value: string }>;
  total: string;
  totalCents: number;
  /** Headline without cents when round, e.g. "€ 7.930". */
  headline: string;
};

export type Party = { name: string; lines: Array<{ label: string | null; value: string }>; missing: string | null };

export type Condition = { key: "payment" | "validity" | "notes" | "general"; title: string; body: string };

export type Section =
  | { kind: "intro"; id: string; no: number; heading: string; lead: string; body: string; quote: string; points: string[]; /** Index of each printed point in the stored list (empty ones are skipped). */ pointIndexes: number[] }
  | { kind: "text"; id: string; no: number; heading: string; body: string }
  | { kind: "image"; id: string; no: number; src: string | null; caption: string; alt: string }
  | { kind: "highlights"; id: string; no: number; heading: string; items: Array<{ id: string; icon: HighlightIcon; title: string; body: string }> }
  | { kind: "services"; id: string; no: number; heading: string; rows: Row[] }
  | { kind: "options"; id: string; no: number; heading: string; body: string; rows: Row[]; total: string | null }
  | { kind: "summary"; id: string; no: number; heading: string; body: string; groups: MoneyGroup[]; notices: string[]; breakdown: boolean }
  | { kind: "timeline"; id: string; no: number; heading: string; steps: Array<{ id: string; label: string; title: string }> }
  | { kind: "terms"; id: string; no: number; heading: string; columns: Condition[] }
  | { kind: "contacts"; id: string; no: number; heading: string; body: string };

/** A section before numbering, distributed over the union so object literals type-check. */
type SectionInput = Section extends infer S ? (S extends Section ? Omit<S, "no"> : never) : never;

export type Breakdown = Array<{ id: string; name: string; cents: number; share: number; percent: string }>;

export type DocModel = {
  key: TemplateKey;
  ordinario: boolean;
  accent: string;
  onAccent: string;
  /** Accent adjusted to stay readable as small text on the given background. */
  accentText: (background: string) => string;
  issuer: Party & { display: string; tagline: string };
  client: Party;
  logo: LogoInfo | null;
  watermark: string | null;
  versionLabel: string | null;
  cover: {
    id: string | null;
    title: string;
    subtitle: string;
    project: string;
    number: string;
    date: string;
    dateShort: string;
    validity: string | null;
    validityShort: string | null;
    coverPhoto: string | null;
    interiorPhoto: string | null;
    photo: PhotoOption | null;
  } | null;
  header: { title: string; client: string };
  /** Sections before the summary (page 2) and from the summary on (page 3). */
  pages: Section[][];
  breakdown: Breakdown;
  oneTimeCents: number;
  monthlyLabel: string | null;
};

export function mix(color: string, target: string, amount: number): string {
  const a = color.replace("#", "");
  const b = target.replace("#", "");
  const out = [0, 2, 4].map((offset) => {
    const x = Number.parseInt(a.slice(offset, offset + 2), 16);
    const y = Number.parseInt(b.slice(offset, offset + 2), 16);
    return Math.round(x + (y - x) * amount)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${out.join("")}`.toUpperCase();
}

/** Darkens (or lightens) a colour until it reaches the ratio against the background. */
export function ensureContrast(color: string, background: string, ratio = 4.5): string {
  if (contrastRatio(color, background) >= ratio) return color;
  const target = readableOn(background) === "#FFFFFF" ? "#FFFFFF" : "#000000";
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mix(color, target, step / 20);
    if (contrastRatio(candidate, background) >= ratio) return candidate;
  }
  return target;
}

const hex = /^#[0-9A-Fa-f]{6}$/;

/** Accent of the quote: the template colour, the Brand Kit secondary or a custom hex. Anything malformed falls back to the template. */
export function resolveAccent(snapshot: QuoteSnapshot, key: TemplateKey): string {
  const choice = snapshot.document.style?.accent ?? "template";
  const fallback = templateInfo[key].accent;
  if (choice === "template") return fallback;
  const value = choice === "brand" ? snapshot.brand.colorSecondary : choice;
  return hex.test(value) ? value.toUpperCase() : fallback;
}

function toRows(lines: QuoteLine[], snapshot: QuoteSnapshot): Row[] {
  const ordinario = snapshot.fiscal.taxProfile === "ordinario";
  return lines.map((line) => {
    const suffix = billingSuffix(line.billing, line.periods);
    const tags: string[] = [];
    if (line.discountBp > 0) tags.push(`Sconto ${formatPercentBp(line.discountBp)}`);
    if (line.priceMode === "gross" && ordinario) tags.push("Prezzo IVA inclusa");
    return {
      id: line.id,
      name: line.name,
      description: line.description.trim(),
      quantity: `${formatQuantity(line.quantityMilli)}${line.unit ? ` ${line.unit}` : ""}`,
      price: euro(line.unitPriceCents),
      vat: line.taxRateBp === 0 ? (line.taxNature ?? "0%") : formatPercentBp(line.taxRateBp),
      net: `${euro(lineNetCents(line, snapshot.fiscal.taxProfile))}${suffix}`,
      tags,
    };
  });
}

function bucketRows(bucket: MoneyBucket, suffix: string, ordinario: boolean): Array<{ label: string; value: string }> {
  const rows = [{ label: "Imponibile", value: `${euro(bucket.netCents)}${suffix}` }];
  if (ordinario) {
    for (const slice of bucket.byRate) {
      if (slice.taxRateBp > 0) rows.push({ label: `IVA (${formatPercentBp(slice.taxRateBp)})`, value: `${euro(slice.vatCents)}${suffix}` });
    }
  }
  return rows;
}

function lineNames(lines: QuoteLine[], billing: QuoteLine["billing"]): string {
  const names = lines.filter((line) => line.billing === billing).map((line) => line.name.trim());
  const joined = names.join(", ");
  return joined.length > 60 ? `${joined.slice(0, 57).trimEnd()}…` : joined;
}

function moneyGroups(snapshot: QuoteSnapshot, project: string): MoneyGroup[] {
  const main = snapshot.totals.main;
  const ordinario = snapshot.fiscal.taxProfile === "ordinario";
  const services = snapshot.document.blocks.flatMap((block) => (block.type === "services" && block.visible ? block.items : []));
  const has = (key: "oneTime" | "monthly" | "yearly") => main[key].byRate.length > 0;
  const groups: MoneyGroup[] = [];
  if (has("oneTime") || (!has("monthly") && !has("yearly"))) {
    const rows = bucketRows(main.oneTime, "", ordinario);
    let total = main.oneTime.totalCents;
    if (main.withholdingCents > 0) {
      rows.push({ label: "Totale documento", value: euro(main.oneTime.totalCents) });
      rows.push({ label: "Ritenuta d'acconto", value: `- ${euro(main.withholdingCents)}` });
      total = main.netPayableCents;
    }
    groups.push({
      key: "oneTime",
      title: "Totale una tantum",
      caption: project,
      suffix: "",
      rows,
      total: euro(total),
      totalCents: total,
      headline: euroShort(total),
    });
  }
  if (has("monthly")) {
    groups.push({
      key: "monthly",
      title: "Canone mensile",
      caption: lineNames(services, "mensile"),
      suffix: " / mese",
      rows: bucketRows(main.monthly, "", ordinario),
      total: euro(main.monthly.totalCents),
      totalCents: main.monthly.totalCents,
      headline: euroShort(main.monthly.totalCents),
    });
  }
  if (has("yearly")) {
    groups.push({
      key: "yearly",
      title: "Canone annuale",
      caption: lineNames(services, "annuale"),
      suffix: " / anno",
      rows: bucketRows(main.yearly, "", ordinario),
      total: euro(main.yearly.totalCents),
      totalCents: main.yearly.totalCents,
      headline: euroShort(main.yearly.totalCents),
    });
  }
  return groups;
}

/** Share of each one-time service line in the one-time taxable base, from real amounts. */
export function computeBreakdown(snapshot: QuoteSnapshot): Breakdown {
  const lines = snapshot.document.blocks.flatMap((block) => (block.type === "services" && block.visible ? block.items : []));
  const items = lines
    .filter((line) => line.billing === "una_tantum")
    .map((line) => ({ id: line.id, name: line.name, cents: lineNetCents(line, snapshot.fiscal.taxProfile) }))
    .filter((item) => item.cents > 0);
  const total = items.reduce((sum, item) => sum + item.cents, 0);
  if (total <= 0) return [];
  // Lines with the same name are one cost item in the chart.
  const merged = new Map<string, { id: string; name: string; cents: number }>();
  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    const found = merged.get(key);
    if (found) found.cents += item.cents;
    else merged.set(key, { ...item });
  }
  const sorted = [...merged.values()].sort((a, b) => b.cents - a.cents);
  const keep = sorted.length > 6 ? 5 : 6;
  const top = sorted.slice(0, keep);
  const rest = sorted.slice(keep);
  if (rest.length) top.push({ id: "altro", name: `Altre ${rest.length} voci`, cents: rest.reduce((sum, item) => sum + item.cents, 0) });
  return top.map((item) => {
    const share = item.cents / total;
    const percent = share * 100;
    return { ...item, share, percent: `${percent < 1 && percent > 0 ? "<1" : Math.round(percent)}%` };
  });
}

function issuerParty(snapshot: QuoteSnapshot): Party {
  const issuer = snapshot.issuer;
  const lines: Party["lines"] = [];
  if (issuer.address) lines.push({ label: null, value: issuer.address });
  if (issuer.vatNumber) lines.push({ label: null, value: `P.IVA ${issuer.vatNumber}` });
  else if (issuer.taxCode) lines.push({ label: null, value: `C.F. ${issuer.taxCode}` });
  if (issuer.phone) lines.push({ label: "T.", value: issuer.phone });
  if (issuer.email) lines.push({ label: "E.", value: issuer.email });
  if (issuer.website) lines.push({ label: "W.", value: issuer.website.replace(/^https?:\/\//, "") });
  return {
    name: issuer.companyName ?? issuer.displayName,
    lines,
    missing: lines.length === 0 ? "Completa i dati aziendali nel Brand Kit." : null,
  };
}

function clientParty(snapshot: QuoteSnapshot): Party {
  const client = snapshot.client;
  if (!client) return { name: "Cliente da scegliere", lines: [], missing: null };
  const lines: Party["lines"] = [];
  if (client.contactName) lines.push({ label: null, value: `Alla c.a. di ${client.contactName}` });
  if (client.address) lines.push({ label: null, value: client.address });
  if (client.vatNumber) lines.push({ label: null, value: `P.IVA ${client.vatNumber}` });
  else if (client.taxCode) lines.push({ label: null, value: `C.F. ${client.taxCode}` });
  if (client.email) lines.push({ label: null, value: client.email });
  return { name: client.name, lines, missing: null };
}

function conditions(block: BlockOf<"terms">, validity: string | null): Condition[] {
  const columns: Condition[] = [];
  if (block.payment.trim()) columns.push({ key: "payment", title: "Pagamento", body: block.payment.trim() });
  if (validity) columns.push({ key: "validity", title: "Validità", body: `La presente proposta è valida fino al ${validity}.` });
  if (block.notes.trim()) columns.push({ key: "notes", title: "Note", body: block.notes.trim() });
  if (block.body.trim()) columns.push({ key: "general", title: columns.length ? "Condizioni generali" : "Condizioni", body: block.body.trim() });
  return columns;
}

export type NumberingScheme = "fromCover" | "fromIntro" | "none";

/** Versions stored before a field existed get its default, so old snapshots keep rendering. */
export function normalizeSnapshot(snapshot: QuoteSnapshot): QuoteSnapshot {
  const parsed = documentSchema.safeParse(snapshot.document);
  return parsed.success ? { ...snapshot, template: asTemplateKey(snapshot.template), document: parsed.data } : { ...snapshot, template: asTemplateKey(snapshot.template) };
}

export function buildModel(source: QuoteSnapshot, resources: Resources, numbering: NumberingScheme): DocModel {
  const snapshot = normalizeSnapshot(source);
  const key = snapshot.template;
  const accent = resolveAccent(snapshot, key);
  const ordinario = snapshot.fiscal.taxProfile === "ordinario";
  const visible = snapshot.document.blocks.filter((block) => block.visible);
  const coverBlock = visible.find((block): block is BlockOf<"cover"> => block.type === "cover") ?? null;
  const rest = visible.filter((block) => block.type !== "cover");
  const title = (coverBlock?.title.trim() || snapshot.quote.title).trim();
  const validity = formatLongDate(snapshot.quote.validUntil);
  const project = coverBlock?.project.trim() || snapshot.quote.title;
  const option = photoOptionFor(key, snapshot.document.style?.photos?.[key]);
  const uploaded = coverBlock?.imageAssetId ? resources.image(coverBlock.imageAssetId) : null;
  const clientName = snapshot.client?.name ?? "Cliente da scegliere";
  const groups = moneyGroups(snapshot, project);

  let counter = numbering === "fromCover" && coverBlock ? 1 : 0;
  const sections: Section[] = [];
  // Images never take a number; in Corporate and Bold the highlights card belongs to the intro.
  const quiet = new Set<Section["kind"]>(key === "corporate" || key === "bold" ? ["image", "highlights"] : ["image"]);
  for (const block of rest) {
    const section = toSection(block, snapshot, validity, groups, resources);
    if (!section) continue;
    const numbered = !quiet.has(section.kind) && numbering !== "none";
    if (numbered) counter += 1;
    sections.push({ ...section, no: numbered ? counter : 0 } as Section);
  }
  const split = sections.findIndex((section) => section.kind === "summary");
  const pages = split > 0 ? [sections.slice(0, split), sections.slice(split)] : [sections];
  const services = snapshot.document.blocks.flatMap((block) => (block.type === "services" && block.visible ? block.items : []));
  const monthlyLabel = lineNames(services, "mensile") || null;

  return {
    key,
    ordinario,
    accent,
    onAccent: readableOn(accent),
    accentText: (background: string) => ensureContrast(accent, background, 4.5),
    issuer: { ...issuerParty(snapshot), display: snapshot.issuer.displayName, tagline: coverBlock?.tagline.trim() ?? "" },
    client: clientParty(snapshot),
    logo: resources.logo,
    watermark: resources.watermark,
    versionLabel: resources.versionLabel,
    cover: coverBlock
      ? {
          id: coverBlock.id,
          title,
          subtitle: coverBlock.subtitle.trim(),
          project,
          number: snapshot.quote.number ?? "Senza numero",
          date: formatLongDate(snapshot.quote.issuedAt) ?? "",
          dateShort: formatShortDate(snapshot.quote.issuedAt) ?? "",
          validity: validity ? `Fino al ${validity}` : null,
          validityShort: formatShortDate(snapshot.quote.validUntil) ? `Fino al ${formatShortDate(snapshot.quote.validUntil)}` : null,
          coverPhoto: uploaded ?? (option ? resources.photo(key, option, "cover") : null),
          interiorPhoto: option ? resources.photo(key, option, "interior") : null,
          photo: uploaded ? null : option,
        }
      : null,
    header: { title: snapshot.quote.title, client: clientName },
    pages,
    breakdown: computeBreakdown(snapshot),
    oneTimeCents: snapshot.totals.main.oneTime.netCents,
    monthlyLabel,
  };
}

function toSection(
  block: QuoteBlock,
  snapshot: QuoteSnapshot,
  validity: string | null,
  groups: MoneyGroup[],
  resources: Resources,
): SectionInput | null {
  const heading = (fallback: string, value: string) => value.trim() || fallback;
  switch (block.type) {
    case "cover":
      return null;
    case "intro":
      return {
        kind: "intro",
        id: block.id,
        heading: heading("Il progetto", block.heading),
        lead: block.lead.trim(),
        body: block.body.trim(),
        quote: block.quote.trim(),
        points: block.points.map((point) => point.trim()).filter(Boolean),
        pointIndexes: block.points.flatMap((point, index) => (point.trim() ? [index] : [])),
      };
    case "text":
      return block.heading.trim() || block.body.trim() ? { kind: "text", id: block.id, heading: block.heading.trim(), body: block.body.trim() } : null;
    case "image":
      return { kind: "image", id: block.id, src: block.assetId ? resources.image(block.assetId) : null, caption: block.caption.trim(), alt: block.alt };
    case "highlights": {
      const items = block.items.filter((item) => item.title.trim() || item.body.trim());
      return items.length ? { kind: "highlights", id: block.id, heading: heading("Vantaggi", block.heading), items } : null;
    }
    case "services":
      return { kind: "services", id: block.id, heading: heading("Servizi inclusi", block.heading), rows: toRows(block.items, snapshot) };
    case "options": {
      if (block.items.length === 0 && !block.body.trim()) return null;
      const options = snapshot.totals.options;
      const parts: string[] = [];
      if (options.oneTime.byRate.length) parts.push(euro(options.oneTime.netCents));
      if (options.monthly.byRate.length) parts.push(`${euro(options.monthly.netCents)} / mese`);
      if (options.yearly.byRate.length) parts.push(`${euro(options.yearly.netCents)} / anno`);
      return {
        kind: "options",
        id: block.id,
        heading: heading("Opzioni facoltative", block.heading),
        body: block.body.trim(),
        rows: toRows(block.items, snapshot),
        total: parts.length ? parts.join(" + ") : null,
      };
    }
    case "summary":
      return {
        kind: "summary",
        id: block.id,
        heading: heading("Riepilogo economico", block.heading),
        body: block.body.trim(),
        groups,
        notices: snapshot.totals.main.notices,
        breakdown: block.breakdown,
      };
    case "timeline": {
      const steps = block.steps.filter((step) => step.label.trim() || step.title.trim());
      return steps.length ? { kind: "timeline", id: block.id, heading: heading("Tempistiche", block.heading), steps } : null;
    }
    case "terms": {
      const columns = conditions(block, validity);
      return columns.length ? { kind: "terms", id: block.id, heading: heading("Condizioni", block.heading), columns } : null;
    }
    case "contacts":
      return { kind: "contacts", id: block.id, heading: heading("Contatti e accettazione", block.heading), body: block.body.trim() };
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}

/** "Proposta per Cliente" → two lines, as in every mockup. A typed newline always wins. */
export function subtitleLines(subtitle: string): string {
  if (subtitle.includes("\n")) return subtitle;
  const match = /^(Proposta per|Preventivo per|Offerta per)\s+(.+)$/i.exec(subtitle);
  return match ? `${match[1]}\n${match[2]}` : subtitle;
}

/**
 * Breaks a short cover title into two balanced lines, the shorter one on top
 * ("Nuovo / Sito Web"), as in the mockups. Long or hand-broken titles are left alone.
 */
export function titleLines(title: string): string {
  const clean = title.trim();
  if (clean.includes("\n") || clean.length > 30) return clean;
  const words = clean.split(/\s+/);
  if (words.length < 3) return words.length === 2 && clean.length > 12 ? words.join("\n") : clean;
  let best = clean;
  let score = Number.POSITIVE_INFINITY;
  for (let cut = 1; cut < words.length; cut += 1) {
    const top = words.slice(0, cut).join(" ");
    const bottom = words.slice(cut).join(" ");
    const value = Math.max(top.length, bottom.length) + (top.length > bottom.length ? 2 : 0);
    if (value < score) {
      score = value;
      best = `${top}\n${bottom}`;
    }
  }
  return best;
}

/** Cover title size that keeps long titles within three lines. */
export function fitTitle(title: string, base: number, min: number): number {
  const length = title.length;
  if (length <= 16) return base;
  if (length <= 26) return Math.max(min, base * 0.86);
  if (length <= 40) return Math.max(min, base * 0.74);
  return min;
}
