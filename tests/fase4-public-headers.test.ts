import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import robots from "@/app/robots";
import { proxy } from "@/proxy";

const token = "Xk3mP9vQ2rA8bC1dE4fG7hJ0kL2mN5pQ8rS1tU4f7Lw";

describe("intestazioni e accesso dei link pubblici", () => {
  afterEach(() => {
    delete process.env.PUBLIC_QUOTE_BASE_URL;
    delete process.env.PUBLIC_QUOTE_LEGACY_HOSTS;
  });

  it("pagina e API del cliente: noindex, no-referrer, no-store, dopo le regole globali", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    for (const source of ["/q/:path*", "/api/q/:path*"]) {
      const index = rules.findIndex((rule) => rule.source === source);
      expect(index).toBeGreaterThan(rules.findIndex((rule) => rule.source === "/:path*"));
      const headers = Object.fromEntries(rules[index]!.headers.map((item) => [item.key, item.value]));
      expect(headers["X-Robots-Tag"]).toContain("noindex");
      expect(headers["Referrer-Policy"]).toBe("no-referrer");
      expect(headers["Cache-Control"]).toContain("no-store");
    }
  });

  it("robots.txt esclude link dei clienti, app e API", () => {
    const rules = robots().rules;
    const disallow = (Array.isArray(rules) ? rules[0]?.disallow : rules?.disallow) ?? [];
    expect(disallow).toEqual(expect.arrayContaining(["/q/", "/app/", "/api/"]));
  });

  it("il cliente apre il link senza login", () => {
    const response = proxy(new NextRequest(`https://ctrl-quotes.vercel.app/q/${token}`));
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("l'app senza sessione resta dietro il login", () => {
    const response = proxy(new NextRequest("https://ctrl-quotes.vercel.app/app/quotes"));
    expect(response.headers.get("location")).toContain("/login");
  });

  it("dal vecchio dominio al nuovo con 308, token e query intatti", () => {
    process.env.PUBLIC_QUOTE_BASE_URL = "https://preventivi.example.com";
    process.env.PUBLIC_QUOTE_LEGACY_HOSTS = "ctrl-quotes.vercel.app";
    const response = proxy(new NextRequest(`https://ctrl-quotes.vercel.app/q/${token}?x=1`));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`https://preventivi.example.com/q/${token}?x=1`);
  });
});
