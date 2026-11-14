import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareRows, currentPlanLabel, effectivePlanId, formatPlanPrice, globalQuoteSendDailyCap, plans, quoteSendDailyLimits, quoteSendLimitReachedMessage, quoteSendQuotaLabel, romeCalendarDay, upcomingFeatures } from "@/domain/plans";

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

  it("maps the workspace plan and a redeem override to starter, pro or business", () => {
    expect(effectivePlanId("free")).toBe("starter");
    expect(effectivePlanId("pro")).toBe("pro");
    expect(effectivePlanId("studio")).toBe("business");
    expect(effectivePlanId("free", "pro")).toBe("pro");
    expect(effectivePlanId("pro", "starter")).toBe("starter");
    expect(currentPlanLabel("free", "business")).toBe("Piano Business");
  });

  it("sets daily send limits: 3 on Starter, 15 on Pro, unlimited on Business", () => {
    expect(quoteSendDailyLimits.starter).toBe(3);
    expect(quoteSendDailyLimits.pro).toBe(15);
    expect(quoteSendDailyLimits.business).toBeNull();
    expect(quoteSendQuotaLabel(1, 3)).toBe("Invii oggi: 1 di 3");
    expect(quoteSendQuotaLabel(0, null)).toBe("Illimitati");
    expect(quoteSendLimitReachedMessage("starter")).toContain("limite di 3 invii");
    expect(quoteSendLimitReachedMessage("pro")).toContain("limite di 15 invii");
  });

  it("uses the Europe/Rome calendar day, so the quota resets at Rome midnight", () => {
    expect(romeCalendarDay(new Date("2026-11-14T22:59:59Z"))).toBe("2026-11-14");
    expect(romeCalendarDay(new Date("2026-11-14T23:00:00Z"))).toBe("2026-11-15");
    expect(romeCalendarDay(new Date("2026-07-10T21:59:59Z"))).toBe("2026-07-10");
    expect(romeCalendarDay(new Date("2026-07-10T22:00:00Z"))).toBe("2026-07-11");
  });

  it("reads the global daily cap from the env, default 90", () => {
    expect(globalQuoteSendDailyCap({})).toBe(90);
    expect(globalQuoteSendDailyCap({ QUOTE_SEND_GLOBAL_DAILY_CAP: "40" })).toBe(40);
    expect(globalQuoteSendDailyCap({ QUOTE_SEND_GLOBAL_DAILY_CAP: "0" })).toBe(90);
    expect(globalQuoteSendDailyCap({ QUOTE_SEND_GLOBAL_DAILY_CAP: "no" })).toBe(90);
  });
});
