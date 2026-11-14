import { describe, expect, it } from "vitest";
import { generateLinkToken } from "@/server/link-token";
import type { EmailDriver, EmailMessage } from "@/server/email/types";
import {
  ERROR_ALERT_TO,
  memoryRateLimiter,
  renderErrorAlert,
  reportServerError,
  resetMemoryRateLimiter,
  sanitizeReport,
} from "@/server/error-alert";

function driver(): EmailDriver & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}

describe("avvisi errore", () => {
  it("ripulisce email, token e IP dal rapporto", () => {
    const token = generateLinkToken();
    const clean = sanitizeReport({
      source: "request",
      message: `fallito /q/${token} per luca.ferri@atelier.example da 203.0.113.7`,
      route: `/q/${token}`,
    });
    expect(clean.message).not.toContain(token);
    expect(clean.message).not.toContain("luca.ferri");
    expect(clean.message).not.toContain("203.0.113.7");
    expect(clean.route).toBe("/q/[token]");
  });

  it("il testo dell'email non riporta dati personali", () => {
    const token = generateLinkToken();
    const rendered = renderErrorAlert(
      { source: "boundary", message: `utente a@b.it token ${token}`, route: `/q/${token}` },
      new Date("2026-11-15T00:30:00Z"),
    );
    expect(rendered.subject).toBe("CTRL Quotes: errore in produzione");
    expect(rendered.text).toContain("Europe/Rome");
    expect(rendered.text).not.toContain("a@b.it");
    expect(rendered.text).not.toContain(token);
    expect(rendered.html).not.toContain("a@b.it");
    expect(rendered.html).toContain("[email]");
  });

  it("invia un avviso e rispetta il limite orario", async () => {
    resetMemoryRateLimiter();
    const email = driver();
    const limiter = memoryRateLimiter();
    const first = await reportServerError(
      { source: "request", message: "boom", digest: "abc123" },
      { live: true, email, limiter, to: ERROR_ALERT_TO },
    );
    const secondSame = await reportServerError(
      { source: "request", message: "boom di nuovo", digest: "abc123" },
      { live: true, email, limiter, to: ERROR_ALERT_TO },
    );
    expect(first).toBe("sent");
    expect(secondSame).toBe("limited");
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]?.to).toBe(ERROR_ALERT_TO);
    expect(email.sent[0]?.text).not.toContain("boom di nuovo");
  });

  it("in ambiente non live si limita a scrivere il log", async () => {
    const email = driver();
    const result = await reportServerError({ source: "manual", message: "solo log" }, { live: false, email });
    expect(result).toBe("logged");
    expect(email.sent).toHaveLength(0);
  });
});
