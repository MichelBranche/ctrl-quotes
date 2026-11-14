import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareRows, currentPlanLabel, formatPlanPrice, plans, upcomingFeatures } from "@/domain/plans";

describe("subscription plans", () => {
  it("formats prices the Italian way", () => {
    expect(formatPlanPrice(plans.starter.priceCents)).toBe("€ 9,00");
    expect(formatPlanPrice(plans.pro.priceCents)).toBe("€ 19,00");
    expect(formatPlanPrice(plans.business.priceCents)).toBe("€ 49,00");
  });

  it("shows the free plan as a trial", () => {
    expect(currentPlanLabel("free")).toBe("Piano di prova");
  });

  it("documents every upcoming feature in the roadmap", () => {
    const roadmap = readFileSync("docs/roadmap-abbonamenti.md", "utf8");
    const all = [...Object.values(upcomingFeatures()).flat(), ...compareRows.filter((row) => row.soon).map((row) => row.label)];
    expect(all.length).toBeGreaterThan(0);
    for (const label of all) expect(roadmap).toContain(label);
  });
});
