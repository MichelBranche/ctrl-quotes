import type { PlanId } from "@/domain/plans";

/**
 * Advanced analytics for the Workspace section. Pure functions over rows already loaded from the
 * database, so they are easy to test and never touch other workspaces. Amounts are cents.
 */

export const analyticsPeriods = [30, 90, 365] as const;
export type AnalyticsPeriod = (typeof analyticsPeriods)[number];

export function asPeriod(raw: string | string[] | undefined): AnalyticsPeriod {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return (analyticsPeriods as readonly number[]).includes(value) ? (value as AnalyticsPeriod) : 30;
}

export type MetricId =
  | "funnel"
  | "response"
  | "value"
  | "pipeline"
  | "engagement"
  | "templates"
  | "clients"
  | "catalog"
  | "team"
  | "payments";

/** Minimum plan for each metric: the funnel is in every plan, then Pro, then Business. */
export const metricPlan: Record<MetricId, PlanId> = {
  funnel: "starter",
  response: "pro",
  value: "pro",
  pipeline: "pro",
  engagement: "pro",
  templates: "pro",
  clients: "pro",
  catalog: "business",
  team: "business",
  payments: "business",
};

const planRank: Record<PlanId, number> = { starter: 0, pro: 1, business: 2 };

export function canSeeMetric(plan: PlanId, metric: MetricId): boolean {
  return planRank[plan] >= planRank[metricPlan[metric]];
}

export type AQuote = {
  id: string;
  title: string;
  number: string | null;
  status: string;
  clientId: string | null;
  templateId: string | null;
  ownerId: string | null;
  totalCents: number;
  recurringCents: number;
  createdAt: Date;
  /** First "sent" event, falling back to quotes.sent_at. Null = never sent. */
  firstSentAt: Date | null;
  firstViewedAt: Date | null;
  lastViewedAt: Date | null;
  decidedAt: Date | null;
  validUntil: Date | null;
  viewCount: number;
};

export type APayment = { quoteId: string; method: string; kind: string; amountCents: number; createdAt: Date };
export type ALine = { quoteId: string; catalogItemId: string; netCents: number };

export type AnalyticsInput = {
  quotes: AQuote[];
  payments: APayment[];
  lines: ALine[];
  names: {
    clients: Map<string, string>;
    templates: Map<string, string>;
    members: Map<string, string>;
    catalog: Map<string, string>;
  };
};

const DAY = 86_400_000;
const HOUR = 3_600_000;

export type Range = { from: Date; to: Date };

export function periodRanges(period: AnalyticsPeriod, now: Date): { current: Range; previous: Range } {
  const to = now;
  const from = new Date(now.getTime() - period * DAY);
  return { current: { from, to }, previous: { from: new Date(from.getTime() - period * DAY), to: from } };
}

const inRange = (date: Date | null, range: Range): date is Date =>
  Boolean(date && date.getTime() >= range.from.getTime() && date.getTime() < range.to.getTime());

const PAID_KINDS = new Set(["paid", "deposit_paid", "marked_paid"]);

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const rate = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);

/** Percent change from previous to current. Null when there is no base to compare with. */
export function delta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export type Funnel = {
  sent: number;
  viewed: number;
  accepted: number;
  rejected: number;
  paid: number;
  acceptanceRate: number | null;
  previous: { sent: number; acceptanceRate: number | null };
};

function funnelFor(input: AnalyticsInput, range: Range) {
  const sent = input.quotes.filter((q) => inRange(q.firstSentAt, range));
  const paidIds = new Set(input.payments.filter((p) => PAID_KINDS.has(p.kind)).map((p) => p.quoteId));
  const accepted = sent.filter((q) => q.status === "accepted").length;
  return {
    sent: sent.length,
    viewed: sent.filter((q) => q.firstViewedAt).length,
    accepted,
    rejected: sent.filter((q) => q.status === "rejected").length,
    paid: sent.filter((q) => paidIds.has(q.id)).length,
    acceptanceRate: rate(accepted, sent.length),
  };
}

export function computeFunnel(input: AnalyticsInput, ranges: { current: Range; previous: Range }): Funnel {
  const prev = funnelFor(input, ranges.previous);
  return { ...funnelFor(input, ranges.current), previous: { sent: prev.sent, acceptanceRate: prev.acceptanceRate } };
}

export type ResponseTimes = { toViewHours: number | null; toDecisionDays: number | null; previous: { toViewHours: number | null; toDecisionDays: number | null } };

function responseFor(input: AnalyticsInput, range: Range) {
  const sent = input.quotes.filter((q) => inRange(q.firstSentAt, range));
  const views = sent.filter((q) => q.firstViewedAt).map((q) => Math.max(0, q.firstViewedAt!.getTime() - q.firstSentAt!.getTime()) / HOUR);
  const decisions = sent
    .filter((q) => q.decidedAt && (q.status === "accepted" || q.status === "rejected"))
    .map((q) => Math.max(0, q.decidedAt!.getTime() - q.firstSentAt!.getTime()) / DAY);
  const v = median(views);
  const d = median(decisions);
  return { toViewHours: v == null ? null : Math.round(v * 10) / 10, toDecisionDays: d == null ? null : Math.round(d * 10) / 10 };
}

export function computeResponse(input: AnalyticsInput, ranges: { current: Range; previous: Range }): ResponseTimes {
  return { ...responseFor(input, ranges.current), previous: responseFor(input, ranges.previous) };
}

export type ValueBucket = { label: string; sentCents: number; acceptedCents: number };
export type ValueSeries = {
  buckets: ValueBucket[];
  sentCents: number;
  acceptedCents: number;
  acceptedRecurringCents: number;
  previous: { sentCents: number; acceptedCents: number };
};

const monthFmt = new Intl.DateTimeFormat("it-IT", { month: "short", timeZone: "Europe/Rome" });
const dayFmt = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" });

/** Weekly buckets for 30 and 90 days, monthly (12 x ~30 days) for a year. */
export function computeValue(input: AnalyticsInput, period: AnalyticsPeriod, ranges: { current: Range; previous: Range }): ValueSeries {
  const size = period === 365 ? 365 / 12 : 7;
  const count = Math.ceil(period / size);
  const start = ranges.current.from.getTime();
  const buckets: ValueBucket[] = Array.from({ length: count }, (_, i) => {
    const at = new Date(start + i * size * DAY);
    return { label: period === 365 ? monthFmt.format(at) : dayFmt.format(at), sentCents: 0, acceptedCents: 0 };
  });
  const indexOf = (date: Date) => Math.min(count - 1, Math.floor((date.getTime() - start) / (size * DAY)));
  let sentCents = 0;
  let acceptedCents = 0;
  let acceptedRecurringCents = 0;
  let prevSent = 0;
  let prevAccepted = 0;
  for (const q of input.quotes) {
    if (inRange(q.firstSentAt, ranges.current)) {
      buckets[indexOf(q.firstSentAt)]!.sentCents += q.totalCents;
      sentCents += q.totalCents;
    } else if (inRange(q.firstSentAt, ranges.previous)) prevSent += q.totalCents;
    if (q.status !== "accepted") continue;
    if (inRange(q.decidedAt, ranges.current)) {
      buckets[indexOf(q.decidedAt)]!.acceptedCents += q.totalCents;
      acceptedCents += q.totalCents;
      acceptedRecurringCents += q.recurringCents;
    } else if (inRange(q.decidedAt, ranges.previous)) prevAccepted += q.totalCents;
  }
  return { buckets, sentCents, acceptedCents, acceptedRecurringCents, previous: { sentCents: prevSent, acceptedCents: prevAccepted } };
}

export type QuoteRef = { id: string; title: string; number: string | null; client: string | null; totalCents: number; date: Date | null };

const OPEN = new Set(["pending", "changes_requested"]);

function ref(input: AnalyticsInput, q: AQuote, date: Date | null): QuoteRef {
  return { id: q.id, title: q.title, number: q.number, client: q.clientId ? (input.names.clients.get(q.clientId) ?? null) : null, totalCents: q.totalCents, date };
}

export type Pipeline = { openCount: number; openCents: number; expiringCount: number; expiringCents: number; expiring: QuoteRef[] };

/** Open quotes right now, independent of the period. "Expiring" = validity ends in the next 7 days. */
export function computePipeline(input: AnalyticsInput, now: Date): Pipeline {
  const open = input.quotes.filter((q) => OPEN.has(q.status));
  const limit = now.getTime() + 7 * DAY;
  const expiring = open
    .filter((q) => q.validUntil && q.validUntil.getTime() >= now.getTime() - DAY && q.validUntil.getTime() <= limit)
    .sort((a, b) => a.validUntil!.getTime() - b.validUntil!.getTime());
  return {
    openCount: open.length,
    openCents: open.reduce((sum, q) => sum + q.totalCents, 0),
    expiringCount: expiring.length,
    expiringCents: expiring.reduce((sum, q) => sum + q.totalCents, 0),
    expiring: expiring.slice(0, 5).map((q) => ref(input, q, q.validUntil)),
  };
}

export type Engagement = { avgViews: number | null; neverOpened: number; followUp: Array<QuoteRef & { views: number }> };

/** Follow up = open, opened at least once, last opened 3+ days ago and still undecided. */
export function computeEngagement(input: AnalyticsInput, range: Range, now: Date): Engagement {
  const sent = input.quotes.filter((q) => inRange(q.firstSentAt, range));
  const avg = sent.length ? Math.round((sent.reduce((s, q) => s + q.viewCount, 0) / sent.length) * 10) / 10 : null;
  const followUp = input.quotes
    .filter((q) => OPEN.has(q.status) && q.lastViewedAt && now.getTime() - q.lastViewedAt.getTime() >= 3 * DAY)
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 5)
    .map((q) => ({ ...ref(input, q, q.lastViewedAt), views: q.viewCount }));
  return { avgViews: avg, neverOpened: sent.filter((q) => OPEN.has(q.status) && !q.firstViewedAt).length, followUp };
}

export type GroupRow = { key: string; label: string; sent: number; accepted: number; rate: number | null; acceptedCents: number; avgCents: number | null };

function groupBy(input: AnalyticsInput, range: Range, keyOf: (q: AQuote) => string | null, labelOf: (key: string) => string): GroupRow[] {
  const map = new Map<string, { sent: number; accepted: number; acceptedCents: number; totalCents: number }>();
  for (const q of input.quotes) {
    if (!inRange(q.firstSentAt, range)) continue;
    const key = keyOf(q);
    if (!key) continue;
    const row = map.get(key) ?? { sent: 0, accepted: 0, acceptedCents: 0, totalCents: 0 };
    row.sent += 1;
    row.totalCents += q.totalCents;
    if (q.status === "accepted") {
      row.accepted += 1;
      row.acceptedCents += q.totalCents;
    }
    map.set(key, row);
  }
  return [...map.entries()].map(([key, row]) => ({
    key,
    label: labelOf(key),
    sent: row.sent,
    accepted: row.accepted,
    rate: rate(row.accepted, row.sent),
    acceptedCents: row.acceptedCents,
    avgCents: row.sent ? Math.round(row.totalCents / row.sent) : null,
  }));
}

export function computeTemplates(input: AnalyticsInput, range: Range): GroupRow[] {
  return groupBy(input, range, (q) => q.templateId, (key) => input.names.templates.get(key) ?? "Template")
    .sort((a, b) => b.sent - a.sent);
}

export function computeClients(input: AnalyticsInput, range: Range): GroupRow[] {
  return groupBy(input, range, (q) => q.clientId, (key) => input.names.clients.get(key) ?? "Cliente")
    .sort((a, b) => b.acceptedCents - a.acceptedCents || b.sent - a.sent)
    .slice(0, 6);
}

export type CatalogRow = { key: string; label: string; quotes: number; netCents: number };

/** Catalog items in quotes accepted during the period, by net value (VAT excluded). */
export function computeCatalog(input: AnalyticsInput, range: Range): CatalogRow[] {
  const accepted = new Set(input.quotes.filter((q) => q.status === "accepted" && inRange(q.decidedAt, range)).map((q) => q.id));
  const map = new Map<string, { quotes: Set<string>; netCents: number }>();
  for (const line of input.lines) {
    if (!accepted.has(line.quoteId)) continue;
    const row = map.get(line.catalogItemId) ?? { quotes: new Set<string>(), netCents: 0 };
    row.quotes.add(line.quoteId);
    row.netCents += line.netCents;
    map.set(line.catalogItemId, row);
  }
  return [...map.entries()]
    .map(([key, row]) => ({ key, label: input.names.catalog.get(key) ?? "Voce eliminata dal catalogo", quotes: row.quotes.size, netCents: row.netCents }))
    .sort((a, b) => b.netCents - a.netCents)
    .slice(0, 8);
}

export type TeamRow = GroupRow & { created: number };

export function computeTeam(input: AnalyticsInput, range: Range): TeamRow[] {
  const created = new Map<string, number>();
  for (const q of input.quotes) if (q.ownerId && inRange(q.createdAt, range)) created.set(q.ownerId, (created.get(q.ownerId) ?? 0) + 1);
  const rows = new Map(groupBy(input, range, (q) => q.ownerId, (key) => input.names.members.get(key) ?? "Utente rimosso").map((row) => [row.key, row]));
  const keys = new Set([...created.keys(), ...rows.keys()]);
  return [...keys]
    .map((key) => {
      const row = rows.get(key) ?? { key, label: input.names.members.get(key) ?? "Utente rimosso", sent: 0, accepted: 0, rate: null, acceptedCents: 0, avgCents: null };
      return { ...row, created: created.get(key) ?? 0 };
    })
    .sort((a, b) => b.acceptedCents - a.acceptedCents || b.sent - a.sent);
}

export type Payments = {
  collectedCents: number;
  depositCents: number;
  byMethod: Array<{ method: string; label: string; cents: number }>;
  /** Accepted in the period minus what was collected for those quotes. Never negative. */
  outstandingCents: number;
  previous: { collectedCents: number };
};

const methodLabel: Record<string, string> = { iban: "Bonifico", paypal: "PayPal", stripe: "Carta (Stripe)" };

export function computePayments(input: AnalyticsInput, ranges: { current: Range; previous: Range }): Payments {
  const paid = input.payments.filter((p) => PAID_KINDS.has(p.kind));
  const current = paid.filter((p) => inRange(p.createdAt, ranges.current));
  const byMethod = new Map<string, number>();
  for (const p of current) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amountCents);
  const paidByQuote = new Map<string, number>();
  for (const p of paid) paidByQuote.set(p.quoteId, (paidByQuote.get(p.quoteId) ?? 0) + p.amountCents);
  const outstanding = input.quotes
    .filter((q) => q.status === "accepted" && inRange(q.decidedAt, ranges.current))
    .reduce((sum, q) => sum + Math.max(0, q.totalCents - (paidByQuote.get(q.id) ?? 0)), 0);
  return {
    collectedCents: current.reduce((sum, p) => sum + p.amountCents, 0),
    depositCents: current.filter((p) => p.kind === "deposit_paid").reduce((sum, p) => sum + p.amountCents, 0),
    byMethod: [...byMethod.entries()].map(([method, cents]) => ({ method, label: methodLabel[method] ?? method, cents })).sort((a, b) => b.cents - a.cents),
    outstandingCents: outstanding,
    previous: { collectedCents: paid.filter((p) => inRange(p.createdAt, ranges.previous)).reduce((sum, p) => sum + p.amountCents, 0) },
  };
}
