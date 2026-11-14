import { describe, expect, it } from "vitest";
import { buttonColor, defaultMessage, defaultSubject, emailFooterLines, firstName, renderQuoteEmail } from "@/domain/quote-email";

const base = {
  studioName: "Studio <Esempio>",
  quoteNumber: "2026/001",
  quoteTitle: "Nuovo sito",
  totalLabel: "3.294,00 € IVA inclusa",
  validUntilLabel: "12 gennaio 2027",
  message: "Ciao Luca,\necco la proposta.\n\n<script>alert(1)</script>",
  url: "https://ctrl-quotes.vercel.app/q/abc",
  brandColor: "#6d28d9",
  isUpdate: false,
};

describe("email del preventivo", () => {
  it("escapa i contenuti scritti dall'utente nell'HTML", () => {
    const { html, text } = renderQuoteEmail(base);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Studio &lt;Esempio&gt;");
    expect(text).toContain("<script>alert(1)</script>");
    expect(text).toContain("Apri il preventivo: https://ctrl-quotes.vercel.app/q/abc");
  });

  it("ha titolo, piè di pagina e versione testo, senza trattini lunghi", () => {
    const { html, text } = renderQuoteEmail(base);
    expect(html).toContain("Il tuo preventivo è pronto");
    expect(renderQuoteEmail({ ...base, isUpdate: true }).html).toContain("Il preventivo è stato aggiornato");
    expect(emailFooterLines(base)).toEqual(["2026/001 · 3.294,00 € IVA inclusa", "Valido fino al 12 gennaio 2027", "Il link è personale: non inoltrarlo."]);
    for (const value of [html, text, defaultSubject("X", true), defaultMessage({ recipientName: "Luca Ferri", title: "X", senderName: "Giulia Neri", isUpdate: true })]) {
      expect(value).not.toContain("\u2014");
    }
  });

  it("testi predefiniti con i nomi propri, o neutri se mancano", () => {
    expect(defaultMessage({ recipientName: "Luca Ferri", title: "il sito", senderName: "Giulia Neri", isUpdate: false })).toMatch(/^Ciao Luca,\n[\s\S]*\nA presto, Giulia$/);
    expect(defaultMessage({ recipientName: null, title: "il sito", senderName: null, isUpdate: false })).toMatch(/^Buongiorno,\n[\s\S]*\nA presto$/);
    expect(firstName("  Anna  Maria ")).toBe("Anna");
    expect(defaultSubject("x".repeat(300), false).length).toBeLessThanOrEqual(160);
  });

  it("usa il colore del brand per il pulsante solo se il testo bianco resta leggibile", () => {
    expect(buttonColor("#6D28D9")).toBe("#6d28d9");
    expect(buttonColor("#f5e663")).toBe("#1f1b18");
    expect(buttonColor("rosso")).toBe("#1f1b18");
  });
});
