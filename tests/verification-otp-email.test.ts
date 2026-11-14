import { describe, expect, it } from "vitest";
import { renderVerificationOtpEmail, VERIFICATION_OTP_SUBJECT } from "@/server/email/verification-otp";

describe("email di verifica OTP", () => {
  const rendered = renderVerificationOtpEmail({ otp: "482716", year: 2026, assetBase: "https://quotes.ctrlagency.dev/email" });

  it("usa un codice a 6 cifre in testo e in caselle HTML copiabili", () => {
    expect(rendered.subject).toBe(VERIFICATION_OTP_SUBJECT);
    expect(rendered.text).toContain("Codice: 482716");
    expect(rendered.text).toContain("10 minuti");
    expect(rendered.text).toContain("© 2026 CTRL® Quotes");
    for (const digit of "482716") {
      expect(rendered.html).toContain(`>${digit}<`);
    }
    expect(rendered.html).toContain("Il tuo codice di verifica è 482716");
  });

  it("resta compatibile con i client di posta", () => {
    expect(rendered.html).toContain("<table");
    expect(rendered.html).toContain("max-width:600px");
    expect(rendered.html).toContain("https://quotes.ctrlagency.dev/email/logo.png");
    expect(rendered.html).toContain("https://quotes.ctrlagency.dev/email/hero.png");
    expect(rendered.html).toContain("https://quotes.ctrlagency.dev/email/shield.png");
    expect(rendered.html).toContain("background-color:#7c3aed");
    expect(rendered.html).toContain("Conferma");
    expect(rendered.html).toContain("la tua email");
    expect(rendered.html).toContain("<strong") 
    expect(rendered.html).toContain("10 minuti");
    expect(rendered.html).toContain("Non hai richiesto questa registrazione?");
  });
});
