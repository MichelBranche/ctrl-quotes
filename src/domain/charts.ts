import { chartBlockTypes, lineNetCents, type ChartBlockType, type QuoteDocument, type QuoteLine } from "@/domain/quote-document";
import type { MoneyBucket, PriceResult, TaxProfile } from "@/domain/pricing";

/**
 * Data behind the chart blocks. Everything comes from the quote itself: the same per-line amounts
 * the tables print and the same buckets the Riepilogo prints, so a chart never disagrees with the
 * totals. When the data is not there the functions say why, and the renderers print nothing.
 */

export { chartBlockTypes, type ChartBlockType };

export function isChartType(type: string): type is ChartBlockType {
  return (chartBlockTypes as readonly string[]).includes(type);
}

export type ChartGroup = "line" | "section";
export type ChartVatChoice = "auto" | "net" | "gross";
/** What the amounts of a chart are: taxable base, base plus VAT, or plain amounts where there is no VAT. */
export type ChartVat = "net" | "gross" | "none";
export type Basis = "oneTime" | "monthly" | "yearly";

export type Empty = { ok: false; reason: string };

/** Splits `total` into integer parts proportional to `weights`, largest remainders first. The parts always sum to `total`. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const raw = weights.map((weight) => (total * weight) / sum);
  const parts = raw.map((value) => Math.floor(value));
  let left = total - parts.reduce((acc, value) => acc + value, 0);
  const order = raw.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    parts[index] = (parts[index] ?? 0) + 1;
    left -= 1;
  }
  return parts;
}

/** Whole percentages that always add up to 100 (largest remainder). */
export function wholePercents(values: number[]): number[] {
  return allocate(100, values);
}

/** "40%", "<1%" for a real but tiny share that rounds to zero. */
export function percentLabel(percent: number, cents: number): string {
  return percent === 0 && cents > 0 ? "<1%" : `${percent}%`;
}

export function resolveVat(type: ChartBlockType, choice: ChartVatChoice, taxProfile: TaxProfile): ChartVat {
  if (taxProfile !== "ordinario") return "none";
  if (choice !== "auto") return choice;
  // Costs read like the tables (taxable base); instalments are what the client actually pays.
  return type === "chartPayments" ? "gross" : "net";
}

export const basisLabel: Record<Basis, string> = { oneTime: "Una tantum", monthly: "Canone mensile", yearly: "Canone annuale" };
export const vatLabel: Record<ChartVat, string | null> = { net: "IVA esclusa", gross: "IVA inclusa", none: null };

const billingOf: Record<Basis, QuoteLine["billing"]> = { oneTime: "una_tantum", monthly: "mensile", yearly: "annuale" };

type Costed = { id: string; name: string; section: { id: string; label: string }; cents: number };

/** Visible services lines of one billing cycle with their amount, VAT shared out exactly as the bucket has it. */
function costedLines(document: QuoteDocument, taxProfile: TaxProfile, bucket: MoneyBucket, basis: Basis, vat: ChartVat): Costed[] {
  const lines: Array<Costed & { rate: number }> = [];
  for (const block of document.blocks) {
    if (block.type !== "services" || !block.visible) continue;
    const section = { id: block.id, label: block.heading.trim() || "Servizi" };
    for (const line of block.items) {
      if (line.billing !== billingOf[basis]) continue;
      lines.push({ id: line.id, name: line.name.trim(), section, cents: lineNetCents(line, taxProfile), rate: taxProfile === "ordinario" ? line.taxRateBp : 0 });
    }
  }
  if (vat === "gross") {
    for (const slice of bucket.byRate) {
      const same = lines.filter((line) => line.rate === slice.taxRateBp);
      const shares = allocate(slice.vatCents, same.map((line) => line.cents));
      same.forEach((line, index) => {
        line.cents += shares[index] ?? 0;
      });
    }
  }
  return lines.map((line): Costed => ({ id: line.id, name: line.name, section: line.section, cents: line.cents })).filter((line) => line.cents > 0);
}

export type CostSlice = { id: string; label: string; cents: number; share: number; percent: number };
export type CostData = { basis: Basis; vat: ChartVat; totalCents: number; slices: CostSlice[] };

/** The first billing cycle that has priced services: one-time, else monthly, else yearly. */
export function chartBasis(document: QuoteDocument, taxProfile: TaxProfile, main: PriceResult): Basis | null {
  for (const basis of ["oneTime", "monthly", "yearly"] as const) {
    if (costedLines(document, taxProfile, main[basis], basis, "net").length) return basis;
  }
  return null;
}

/**
 * Cost split by service line (same names merged) or by services section. At most `max` slices:
 * the smallest ones become "Altre N voci". Slice amounts sum to the bucket total of the Riepilogo.
 */
export function costData(
  document: QuoteDocument,
  taxProfile: TaxProfile,
  main: PriceResult,
  options: { group: ChartGroup; vat: ChartVat; max: number; basis?: Basis },
): CostData | Empty {
  const basis = options.basis ?? chartBasis(document, taxProfile, main);
  if (!basis) return { ok: false, reason: "Aggiungi servizi con un prezzo per vedere il grafico." };
  const lines = costedLines(document, taxProfile, main[basis], basis, options.vat);
  if (!lines.length) return { ok: false, reason: "Aggiungi servizi con un prezzo per vedere il grafico." };
  const merged = new Map<string, { id: string; label: string; cents: number }>();
  for (const line of lines) {
    const label = options.group === "section" ? line.section.label : line.name;
    const key = label.toLowerCase();
    const found = merged.get(key);
    if (found) found.cents += line.cents;
    else merged.set(key, { id: options.group === "section" ? line.section.id : line.id, label, cents: line.cents });
  }
  const sorted = [...merged.values()].sort((a, b) => b.cents - a.cents);
  const max = Math.max(2, options.max);
  const keep = sorted.length > max ? max - 1 : max;
  const top = sorted.slice(0, keep);
  const rest = sorted.slice(keep);
  if (rest.length) top.push({ id: "altro", label: `Altre ${rest.length} ${options.group === "section" ? "sezioni" : "voci"}`, cents: rest.reduce((sum, item) => sum + item.cents, 0) });
  const totalCents = top.reduce((sum, item) => sum + item.cents, 0);
  const percents = wholePercents(top.map((item) => item.cents));
  return {
    basis,
    vat: options.vat,
    totalCents,
    slices: top.map((item, index) => ({ ...item, share: item.cents / totalCents, percent: percents[index] ?? 0 })),
  };
}

export type Instalment = { id: string; label: string; bp: number; cents: number };
export type PaymentData = { vat: ChartVat; totalCents: number; rates: Instalment[] };

const remainderWords = /\b(saldo|rest[oa]|restante|rimanente|rimanenza)\b/i;

function cleanLabel(text: string): string {
  const clean = text
    .replace(/\s+/g, " ")
    .replace(/^[\s:\u2013\u2014-]+|[\s.:;\u2013\u2014-]+$/g, "")
    .replace(/\b(pari al|pari a|del|dell'|il|lo|la|di)\s*$/i, "")
    .replace(/^(del|il|di|pari al|pari a)\s+/i, "")
    .trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
}

/**
 * Reads instalments from the payment terms as the client reads them: "40% alla conferma, 40% a
 * sviluppo completato, 20% alla messa online", or "30% alla firma, saldo alla consegna".
 * Nothing is guessed: the shares must add up to 100%, possibly with one "saldo" taking the rest.
 */
export function parsePaymentTerms(text: string): { ok: true; rates: Array<{ label: string; bp: number }> } | Empty {
  const parts = text
    .split(/[;\n]|,(?!\d)|\s+e\s+(?=(?:il\s+)?\d{1,3}(?:[.,]\d{1,2})?\s*%|saldo)/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const rates: Array<{ label: string; bp: number | null }> = [];
  for (const part of parts) {
    const match = /(\d{1,3}(?:[.,]\d{1,2})?)\s*%/.exec(part);
    if (match) {
      const bp = Math.round(Number(match[1]?.replace(",", ".")) * 100);
      const before = part.slice(0, match.index).replace(/\b(pari al|pari a|del|dello|della|il|di)\s*$/i, "").trim();
      const after = part.slice(match.index + match[0].length).replace(/^\s*(del totale|dell'importo|di acconto)\b/i, "").trim();
      const label = cleanLabel(`${before} ${after}`);
      rates.push({ label: label || `Rata ${rates.length + 1}`, bp });
    } else if (remainderWords.test(part) && rates.length) {
      rates.push({ label: cleanLabel(part) || "Saldo", bp: null });
    }
  }
  if (!rates.length) return { ok: false, reason: "Scrivi le rate nelle Condizioni, per esempio «40% alla conferma, 60% alla consegna»." };
  const open = rates.filter((rate) => rate.bp === null);
  const fixed = rates.reduce((sum, rate) => sum + (rate.bp ?? 0), 0);
  if (open.length > 1) return { ok: false, reason: "Nelle Condizioni c'è più di un saldo senza percentuale." };
  if (open.length === 1) {
    if (fixed >= 10000) return { ok: false, reason: "Le rate nelle Condizioni superano già il 100% prima del saldo." };
    return { ok: true, rates: rates.map((rate) => ({ label: rate.label, bp: rate.bp ?? 10000 - fixed })) };
  }
  if (fixed !== 10000) {
    return { ok: false, reason: `Le rate nelle Condizioni sommano a ${(fixed / 100).toLocaleString("it-IT")}%: per il grafico devono fare 100%.` };
  }
  if (rates.some((rate) => (rate.bp ?? 0) <= 0)) return { ok: false, reason: "Ogni rata deve avere una percentuale maggiore di zero." };
  return { ok: true, rates: rates.map((rate) => ({ label: rate.label, bp: rate.bp ?? 0 })) };
}

/** Instalments in euro on the one-time total of the Riepilogo. They always add up to that total. */
export function paymentData(document: QuoteDocument, main: PriceResult, vat: ChartVat): PaymentData | Empty {
  const terms = document.blocks.find((block) => block.type === "terms" && block.visible && block.payment.trim());
  if (!terms || terms.type !== "terms") {
    return { ok: false, reason: "Scrivi le rate nel campo Pagamento delle Condizioni, per esempio «40% alla conferma, 60% alla consegna»." };
  }
  const parsed = parsePaymentTerms(terms.payment);
  if (!parsed.ok) return parsed;
  const totalCents = vat === "gross" ? main.oneTime.totalCents : main.oneTime.netCents;
  if (totalCents <= 0) return { ok: false, reason: "Aggiungi servizi una tantum con un prezzo per calcolare le rate." };
  const amounts = allocate(totalCents, parsed.rates.map((rate) => rate.bp));
  return {
    vat,
    totalCents,
    rates: parsed.rates.map((rate, index) => ({ id: `rata-${index + 1}`, label: rate.label, bp: rate.bp, cents: amounts[index] ?? 0 })),
  };
}

export type TimeUnit = "giorno" | "settimana" | "mese";
export type Phase = { id: string; label: string; title: string; start: number; end: number };
/** `unit` null: the labels carry no readable period, phases are shown in order with the same width. */
export type TimelineData = { unit: TimeUnit | null; span: number; phases: Phase[] };

const unitPattern = "(settiman[ae]|sett\\.?|giorn[oi]|gg\\.?|mes[ei])";

function unitOf(word: string): TimeUnit {
  const lower = word.toLowerCase();
  if (lower.startsWith("g")) return "giorno";
  if (lower.startsWith("m")) return "mese";
  return "settimana";
}

/** "Settimana 1", "Settimane 2-3", "Mesi 1-2", "Giorni 3 a 5": a range of the same unit. */
export function parseRange(label: string): { unit: TimeUnit; start: number; end: number } | null {
  const match = new RegExp(`^${unitPattern}\\s*(\\d{1,3})(?:\\s*(?:-|\\u2013|\\u2014|a|al|fino a)\\s*(\\d{1,3}))?\\s*$`, "i").exec(label.trim());
  if (!match?.[1] || !match[2]) return null;
  const from = Number(match[2]);
  const to = match[3] ? Number(match[3]) : from;
  if (from < 1 || to < from) return null;
  return { unit: unitOf(match[1]), start: from - 1, end: to };
}

/** "2 settimane", "10 giorni": a length, phases follow one another. */
export function parseLength(label: string): { unit: TimeUnit; length: number } | null {
  const match = new RegExp(`^(\\d{1,3})\\s*${unitPattern}\\s*$`, "i").exec(label.trim());
  if (!match?.[1] || !match[2]) return null;
  const length = Number(match[1]);
  return length > 0 ? { unit: unitOf(match[2]), length } : null;
}

/** Phases from the Tempistiche block, even when that block is hidden (the chart can replace it). */
export function timelineData(document: QuoteDocument): TimelineData | Empty {
  const block = document.blocks.find((entry) => entry.type === "timeline");
  const steps = block && block.type === "timeline" ? block.steps.filter((step) => step.label.trim() || step.title.trim()) : [];
  if (!steps.length) return { ok: false, reason: "Aggiungi le fasi nel blocco Tempistiche per vedere la timeline." };
  const ranges = steps.map((step) => parseRange(step.label));
  const lengths = steps.map((step) => parseLength(step.label));
  const base = (step: (typeof steps)[number]) => ({ id: step.id, label: step.label.trim(), title: step.title.trim() });
  const sameUnit = <T extends { unit: TimeUnit } | null>(list: T[]) => list.every((entry) => entry && entry.unit === list[0]?.unit);
  if (sameUnit(ranges)) {
    const phases = steps.map((step, index) => ({ ...base(step), start: ranges[index]?.start ?? 0, end: ranges[index]?.end ?? 1 }));
    return { unit: ranges[0]?.unit ?? null, span: Math.max(...phases.map((phase) => phase.end)), phases };
  }
  if (sameUnit(lengths)) {
    let at = 0;
    const phases = steps.map((step, index) => {
      const start = at;
      at += lengths[index]?.length ?? 1;
      return { ...base(step), start, end: at };
    });
    return { unit: lengths[0]?.unit ?? null, span: at, phases };
  }
  return { unit: null, span: steps.length, phases: steps.map((step, index) => ({ ...base(step), start: index, end: index + 1 })) };
}

export const unitShort: Record<TimeUnit, string> = { giorno: "G", settimana: "S", mese: "M" };
export const unitPlural: Record<TimeUnit, string> = { giorno: "giorni", settimana: "settimane", mese: "mesi" };
