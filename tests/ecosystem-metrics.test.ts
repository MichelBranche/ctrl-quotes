import { describe, expect, it } from "vitest";
import { fillSignupMonths, lastTwelveMonths } from "@/server/ecosystem-metrics";
import { bearerAuth, safeEqual } from "@/server/internal-auth";

describe("bearerAuth", () => {
  it("is unconfigured when the secret is missing or too short", () => {
    expect(bearerAuth("Bearer abcdefghijklmnop", undefined)).toBe("unconfigured");
    expect(bearerAuth("Bearer abcdefghijklmnop", "")).toBe("unconfigured");
    expect(bearerAuth("Bearer abcdefghijklmnop", "short")).toBe("unconfigured");
  });

  it("rejects a missing or wrong token", () => {
    const secret = "a-dedicated-secret-16";
    expect(bearerAuth(null, secret)).toBe("unauthorized");
    expect(bearerAuth("Bearer wrong-token-value", secret)).toBe("unauthorized");
    expect(bearerAuth("Token " + secret, secret)).toBe("unauthorized");
  });

  it("accepts a matching Bearer token", () => {
    const secret = "a-dedicated-secret-16";
    expect(bearerAuth(`Bearer ${secret}`, secret)).toBe("ok");
    expect(bearerAuth(`bearer ${secret}`, secret)).toBe("ok");
  });

  it("compares equal strings in constant time", () => {
    expect(safeEqual("same-value", "same-value")).toBe(true);
    expect(safeEqual("same-value", "other-value")).toBe(false);
  });
});

describe("andamento iscrizioni", () => {
  it("riempie i dodici mesi e tiene i conteggi noti", () => {
    const now = new Date("2026-11-22T12:00:00.000Z");
    const months = lastTwelveMonths(now);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-12");
    expect(months[11]).toBe("2026-11");
    const filled = fillSignupMonths([{ month: "2026-11", workspaces: 2 }, { month: "2026-01", workspaces: 1 }], now);
    expect(filled).toHaveLength(12);
    expect(filled.find((row) => row.month === "2026-11")?.workspaces).toBe(2);
    expect(filled.find((row) => row.month === "2026-01")?.workspaces).toBe(1);
    expect(filled.find((row) => row.month === "2026-06")?.workspaces).toBe(0);
  });
});
