import fs from "node:fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { legalPlaceholders, ownCookies } from "@/domain/legal";

describe("pagine legali", () => {
  it("i segnaposto societari sono espliciti e non inventano partita IVA o sede", () => {
    expect(legalPlaceholders.vat).toContain("DA COMPLETARE");
    expect(legalPlaceholders.address).toContain("DA COMPLETARE");
    expect(legalPlaceholders.privacyEmail).toContain("DA COMPLETARE");
    expect(legalPlaceholders.vat).toMatch(/partita IVA/i);
    expect(legalPlaceholders.address).toMatch(/sede legale/i);
  });

  it("privacy e termini usano i segnaposto e citano solo fornitori reali", () => {
    const privacy = fs.readFileSync(path.join(process.cwd(), "src/app/privacy/page.tsx"), "utf8");
    const terms = fs.readFileSync(path.join(process.cwd(), "src/app/termini/page.tsx"), "utf8");
    const shell = fs.readFileSync(path.join(process.cwd(), "src/components/legal/legal-shell.tsx"), "utf8");
    for (const text of [privacy, terms]) {
      expect(text).toContain("legalPlaceholders.vat");
      expect(text).toContain("legalPlaceholders.address");
    }
    expect(shell).toContain("professionista");
    expect(terms).toContain("professionista");
    for (const name of ["Vercel", "Turso", "Resend", "Vercel Blob", "Better Auth", "Google", "Cloudflare Turnstile"]) {
      expect(privacy).toContain(name);
    }
    expect(privacy).toContain('id="cookie"');
    expect(privacy).toContain("banner");
    expect(ownCookies.some((cookie) => cookie.name.includes("session_token"))).toBe(true);
    expect(ownCookies.some((cookie) => cookie.name === "cq_workspace")).toBe(true);
    expect(ownCookies.every((cookie) => cookie.kind === "tecnico")).toBe(true);
  });
});
