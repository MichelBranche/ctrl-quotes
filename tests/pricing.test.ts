import { describe, expect, it } from "vitest";
import { priceQuote, type PriceLine } from "@/domain/pricing";

const services: PriceLine[] = [
  line("analisi", 60_000),
  line("design", 120_000),
  line("sviluppo", 100_000),
  line("setup", 40_000),
];

function line(id: string, unitPriceCents: number, extra: Partial<PriceLine> = {}): PriceLine {
  return {
    id,
    quantityMilli: 1000,
    unitPriceCents,
    discountBp: 0,
    priceMode: "net",
    taxRateBp: 2200,
    billing: "one_time",
    ...extra,
  };
}

describe("priceQuote", () => {
  it("calcola IVA ordinaria per aliquota, non riga per riga", () => {
    const result = priceQuote({
      lines: services,
      taxProfile: "ordinario",
      withholdingBp: 0,
      stampDutyNote: false,
    });
    expect(result.oneTime.netCents).toBe(320_000);
    expect(result.oneTime.vatCents).toBe(70_400);
    expect(result.oneTime.totalCents).toBe(390_400);
    expect(result.monthly.totalCents).toBe(0);
  });

  it("separa il ricorrente e non lo somma al totale una tantum", () => {
    const result = priceQuote({
      lines: [
        ...services,
        line("seo", 30_000),
        line("manutenzione", 9_000, { billing: "monthly" }),
      ],
      taxProfile: "ordinario",
      withholdingBp: 0,
      stampDutyNote: false,
    });
    expect(result.oneTime.netCents).toBe(350_000);
    expect(result.oneTime.vatCents).toBe(77_000);
    expect(result.oneTime.totalCents).toBe(427_000);
    expect(result.monthly.netCents).toBe(9_000);
    expect(result.monthly.vatCents).toBe(1_980);
    expect(result.monthly.totalCents).toBe(10_980);
  });

  it("azzera l'IVA in regime forfettario e propone il bollo solo come nota", () => {
    const result = priceQuote({
      lines: services,
      taxProfile: "forfettario",
      withholdingBp: 2000,
      stampDutyNote: true,
    });
    expect(result.oneTime.vatCents).toBe(0);
    expect(result.oneTime.totalCents).toBe(320_000);
    expect(result.withholdingCents).toBe(0);
    expect(result.notices.some((note) => note.includes("forfettario"))).toBe(true);
    expect(result.notices.some((note) => note.includes("bollo"))).toBe(true);
    expect(result.netPayableCents).toBe(320_000);
  });

  it("calcola la ritenuta sul netto una tantum", () => {
    const result = priceQuote({
      lines: services,
      taxProfile: "ordinario",
      withholdingBp: 2000,
      stampDutyNote: false,
    });
    expect(result.withholdingCents).toBe(64_000);
    expect(result.netPayableCents).toBe(326_400);
  });

  it("arrotonda l'IVA sul totale di aliquota", () => {
    const result = priceQuote({
      lines: [line("a", 33), line("b", 33), line("c", 33)],
      taxProfile: "ordinario",
      withholdingBp: 0,
      stampDutyNote: false,
    });
    expect(result.oneTime.netCents).toBe(99);
    expect(result.oneTime.vatCents).toBe(22);
    expect(result.oneTime.totalCents).toBe(121);
  });

  it("scorpora l'IVA inclusa", () => {
    const result = priceQuote({
      lines: [line("lordo", 12_200, { priceMode: "gross" })],
      taxProfile: "ordinario",
      withholdingBp: 0,
      stampDutyNote: false,
    });
    expect(result.oneTime.netCents).toBe(10_000);
    expect(result.oneTime.vatCents).toBe(2_200);
    expect(result.oneTime.totalCents).toBe(12_200);
  });

  it("applica quantità in millesimi e sconto", () => {
    const result = priceQuote({
      lines: [line("ore", 10_000, { quantityMilli: 1500, discountBp: 1000 })],
      taxProfile: "ordinario",
      withholdingBp: 0,
      stampDutyNote: false,
    });
    expect(result.oneTime.netCents).toBe(13_500);
  });
});
