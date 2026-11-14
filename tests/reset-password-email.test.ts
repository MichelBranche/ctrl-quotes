import { describe, expect, it } from "vitest";
import { renderResetPasswordEmail, RESET_PASSWORD_MINUTES, RESET_PASSWORD_SUBJECT } from "@/server/email/reset-password";

const url = "https://quotes.ctrlagency.dev/reset-password?token=preview-test";

describe("email di reset password", () => {
  const rendered = renderResetPasswordEmail({ url, year: 2026, assetBase: "https://quotes.ctrlagency.dev/email" });

  it("usa il layout di sistema, il pulsante e la scadenza reale", () => {
    expect(rendered.subject).toBe(RESET_PASSWORD_SUBJECT);
    expect(RESET_PASSWORD_MINUTES).toBe(60);
    expect(rendered.html).toContain("<table");
    expect(rendered.html).toContain("max-width:600px");
    expect(rendered.html).toContain("https://quotes.ctrlagency.dev/email/logo.png");
    expect(rendered.html).toContain("https://quotes.ctrlagency.dev/email/hero.png");
    expect(rendered.html).toContain("Reimposta password");
    expect(rendered.html).toContain(url);
    expect(rendered.html).toContain(`>${RESET_PASSWORD_MINUTES} minuti<`);
    expect(rendered.html).toContain("Non hai richiesto il reset?");
    expect(rendered.html).toContain("la tua password resta invariata.");
    expect(rendered.html).toContain("© 2026 CTRL® Quotes");
  });

  it("ha un fallback in testo semplice con il link copiabile", () => {
    expect(rendered.text).toContain("Reimposta la tua password");
    expect(rendered.text).toContain(url);
    expect(rendered.text).toContain("Il link è valido per 60 minuti.");
    expect(rendered.text).toContain("Ignora questa email: la tua password resta invariata.");
  });
});
