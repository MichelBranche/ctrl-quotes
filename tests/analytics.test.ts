import { describe, expect, it } from "vitest";
import {
  asPeriod,
  canSeeMetric,
  computeCatalog,
  computeFunnel,
  computePayments,
  computePipeline,
  computeResponse,
  computeValue,
  delta,
  periodRanges,
  type AnalyticsInput,
  type AQuote,
} from "@/domain/analytics";

const now = new Date("2026-11-21T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

function quote(over: Partial<AQuote>): AQuote {
  return {
    id: "q",
    title: "Preventivo",
    number: null,
    status: "pending",
    clientId: null,
    templateId: null,
    ownerId: null,
    totalCents: 100_00,
    recurringCents: 0,
    createdAt: daysAgo(40),
    firstSentAt: null,
    firstViewedAt: null,
    lastViewedAt: null,
    decidedAt: null,
    validUntil: null,
    viewCount: 0,
    ...over,
  };
}

const input: AnalyticsInput = {
  quotes: [
    quote({ id: "a", status: "accepted", firstSentAt: daysAgo(10), firstViewedAt: daysAgo(9), decidedAt: daysAgo(7), totalCents: 1000_00, viewCount: 3 }),
    quote({ id: "b", status: "rejected", firstSentAt: daysAgo(5), firstViewedAt: daysAgo(5), decidedAt: daysAgo(4) }),
    quote({ id: "c", status: "pending", firstSentAt: daysAgo(2), validUntil: daysAgo(-3), totalCents: 500_00 }),
    quote({ id: "d", status: "accepted", firstSentAt: daysAgo(45), firstViewedAt: daysAgo(44), decidedAt: daysAgo(40) }),
    quote({ id: "e", status: "draft" }),
  ],
  payments: [
    { quoteId: "a", method: "iban", kind: "deposit_paid", amountCents: 300_00, createdAt: daysAgo(6) },
    { quoteId: "a", method: "stripe", kind: "checkout_created", amountCents: 700_00, createdAt: daysAgo(6) },
  ],
  lines: [
    { quoteId: "a", catalogItemId: "web", netCents: 800_00 },
    { quoteId: "d", catalogItemId: "web", netCents: 50_00 },
  ],
  names: { clients: new Map(), templates: new Map(), members: new Map(), catalog: new Map([["web", "Sito web"]]) },
};

describe("analytics", () => {
  const ranges = periodRanges(30, now);

  it("accetta solo i periodi previsti", () => {
    expect(asPeriod("90")).toBe(90);
    expect(asPeriod("7")).toBe(30);
    expect(asPeriod(undefined)).toBe(30);
  });

  it("limita le metriche per piano", () => {
    expect(canSeeMetric("starter", "funnel")).toBe(true);
    expect(canSeeMetric("starter", "value")).toBe(false);
    expect(canSeeMetric("pro", "clients")).toBe(true);
    expect(canSeeMetric("pro", "team")).toBe(false);
    expect(canSeeMetric("business", "payments")).toBe(true);
  });

  it("imbuto sul periodo, con il periodo precedente", () => {
    const f = computeFunnel(input, ranges);
    expect(f).toMatchObject({ sent: 3, viewed: 2, accepted: 1, rejected: 1, paid: 1, acceptanceRate: 33 });
    expect(f.previous).toEqual({ sent: 1, acceptanceRate: 100 });
  });

  it("tempi di risposta in mediana", () => {
    const r = computeResponse(input, ranges);
    expect(r.toViewHours).toBe(12);
    expect(r.toDecisionDays).toBe(2);
  });

  it("valore inviato e accettato", () => {
    const v = computeValue(input, 30, ranges);
    expect(v.sentCents).toBe(1600_00);
    expect(v.acceptedCents).toBe(1000_00);
    expect(v.buckets.reduce((s, b) => s + b.sentCents, 0)).toBe(1600_00);
  });

  it("pipeline e scadenze", () => {
    const p = computePipeline(input, now);
    expect(p).toMatchObject({ openCount: 1, openCents: 500_00, expiringCount: 1 });
  });

  it("catalogo solo sugli accettati del periodo", () => {
    expect(computeCatalog(input, ranges.current)).toEqual([{ key: "web", label: "Sito web", quotes: 1, netCents: 800_00 }]);
  });

  it("incassi ignorano i checkout non pagati", () => {
    const p = computePayments(input, ranges);
    expect(p.collectedCents).toBe(300_00);
    expect(p.depositCents).toBe(300_00);
    expect(p.outstandingCents).toBe(700_00);
  });

  it("delta nullo senza base", () => {
    expect(delta(5, 0)).toBeNull();
    expect(delta(150, 100)).toBe(50);
  });
});
