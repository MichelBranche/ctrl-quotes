import { describe, expect, it } from "vitest";
import { isEditable, isOpenForClient, nextQuoteStatus, quoteStatuses, quoteStatusLabel, sendLabel } from "@/domain/quote-status";

describe("stati del preventivo, fase 4", () => {
  it("la bozza resta modificabile dopo l'invio, solo l'accettato è bloccato", () => {
    for (const status of quoteStatuses) expect(isEditable(status)).toBe(status !== "accepted");
  });

  it("invio e invio dell'aggiornamento", () => {
    expect(nextQuoteStatus("draft", "send", "user")).toBe("pending");
    expect(nextQuoteStatus("pending", "send", "user")).toBe("pending");
    expect(nextQuoteStatus("changes_requested", "send", "user")).toBe("pending");
    expect(nextQuoteStatus("rejected", "send", "user")).toBe("pending");
    expect(nextQuoteStatus("expired", "send", "user")).toBe("pending");
    expect(nextQuoteStatus("accepted", "send", "user")).toBeNull();
    expect(sendLabel(null)).toBe("Invia");
    expect(sendLabel("v1")).toBe("Invia aggiornamento");
  });

  it("solo il cliente decide, e solo su un preventivo aperto", () => {
    expect(nextQuoteStatus("pending", "accept", "recipient")).toBe("accepted");
    expect(nextQuoteStatus("changes_requested", "accept", "recipient")).toBe("accepted");
    expect(nextQuoteStatus("pending", "accept", "user")).toBeNull();
    expect(nextQuoteStatus("draft", "accept", "recipient")).toBeNull();
    expect(nextQuoteStatus("accepted", "accept", "recipient")).toBeNull();
    expect(nextQuoteStatus("accepted", "reject", "recipient")).toBeNull();
    expect(nextQuoteStatus("expired", "accept", "recipient")).toBeNull();
    expect(nextQuoteStatus("pending", "reject", "recipient")).toBe("rejected");
    expect(nextQuoteStatus("pending", "request_changes", "recipient")).toBe("changes_requested");
  });

  it("scadenza e revoca", () => {
    expect(nextQuoteStatus("pending", "expire", "system")).toBe("expired");
    expect(nextQuoteStatus("accepted", "expire", "system")).toBeNull();
    expect(nextQuoteStatus("draft", "expire", "system")).toBeNull();
    expect(nextQuoteStatus("pending", "revoke", "user")).toBe("revoked");
    expect(nextQuoteStatus("accepted", "revoke", "user")).toBeNull();
  });

  it("l'accettato non esce mai dal suo stato", () => {
    for (const transition of ["send", "accept", "reject", "request_changes", "expire", "revoke"] as const) {
      for (const actor of ["user", "recipient", "system"] as const) expect(nextQuoteStatus("accepted", transition, actor)).toBeNull();
    }
  });

  it("aperto al cliente ed etichette", () => {
    expect(isOpenForClient("pending")).toBe(true);
    expect(isOpenForClient("changes_requested")).toBe(true);
    expect(isOpenForClient("accepted")).toBe(false);
    expect(isOpenForClient("rejected")).toBe(false);
    expect(quoteStatusLabel.pending).toBe("Inviato");
    for (const label of Object.values(quoteStatusLabel)) expect(label).not.toMatch(/—/);
  });
});
