import { describe, expect, it } from "vitest";
import {
  CONNECT_APPLICATION_FEE_AMOUNT,
  dueAmountCents,
  formatIbanGroups,
  isValidIban,
  maskIban,
  normalizeIban,
  parsePaypal,
  paypalMePaymentHref,
  renderCausale,
  DEFAULT_CAUSALE_TEMPLATE,
  availablePaymentChoices,
  inferPaymentChoice,
  remainingBalanceCents,
  resolvePaymentCharge,
} from "@/domain/payments";

describe("IBAN", () => {
  it("accetta un IBAN italiano con checksum e spazi", () => {
    expect(isValidIban("IT60 X054 2811 1010 0000 0123 456")).toBe(true);
    expect(normalizeIban("IT60 X054 2811 1010 0000 0123 456")).toBe("IT60X0542811101000000123456");
  });

  it("rifiuta un IBAN con checksum errato o troppo corto", () => {
    expect(isValidIban("IT60 X054 2811 1010 0000 0123 457")).toBe(false);
    expect(isValidIban("IT60")).toBe(false);
    expect(isValidIban("")).toBe(false);
  });

  it("maschera l'IBAN tenendo le prime e le ultime quattro cifre", () => {
    const masked = maskIban("IT60X0542811101000000123456");
    expect(masked.startsWith("IT60")).toBe(true);
    expect(masked.endsWith("3456")).toBe(true);
    expect(masked.includes("0542811101000000")).toBe(false);
    expect(masked).toContain("••••");
    expect(formatIbanGroups("IT60X0542811101000000123456")).toBe("IT60 X054 2811 1010 0000 0123 456");
  });
});

describe("PayPal", () => {
  it("accetta un link paypal.me, un handle e un'email", () => {
    expect(parsePaypal("https://www.paypal.me/StudioRossi")).toEqual({
      ok: true,
      mode: "me",
      handle: "StudioRossi",
      value: "StudioRossi",
    });
    expect(parsePaypal("paypal.me/StudioRossi/")).toMatchObject({ ok: true, mode: "me", handle: "StudioRossi" });
    expect(parsePaypal("StudioRossi")).toMatchObject({ ok: true, mode: "me", handle: "StudioRossi" });
    expect(parsePaypal("pagamenti@studio.it")).toEqual({ ok: true, mode: "email", value: "pagamenti@studio.it" });
  });

  it("rifiuta valori non validi", () => {
    expect(parsePaypal("")).toMatchObject({ ok: false });
    expect(parsePaypal("http://example.com")).toMatchObject({ ok: false });
    expect(parsePaypal("ab")).toMatchObject({ ok: false });
  });

  it("costruisce il link paypal.me con importo e valuta EUR", () => {
    expect(paypalMePaymentHref("StudioRossi", 18240)).toBe("https://www.paypal.me/StudioRossi/182.40EUR");
  });
});

describe("causale e acconto", () => {
  it("compila il modello di causale", () => {
    expect(renderCausale(DEFAULT_CAUSALE_TEMPLATE, { numero: "QT-2026-0012" })).toBe("Preventivo QT-2026-0012");
    expect(renderCausale("Preventivo {numero} · {importo}", { numero: "12", importoCents: 15000 })).toMatch(
      /Preventivo 12 · 150,00/,
    );
    expect(renderCausale("", { numero: "1" })).toBe("Preventivo 1");
  });

  it("calcola l'importo dovuto per intero, percentuale e importo fisso", () => {
    expect(dueAmountCents(10000, "full", null, null)).toBe(10000);
    expect(dueAmountCents(10000, "percent", 3000, null)).toBe(3000);
    expect(dueAmountCents(10001, "percent", 5000, null)).toBe(5001);
    expect(dueAmountCents(10000, "amount", null, 2500)).toBe(2500);
    expect(dueAmountCents(10000, "amount", null, 20000)).toBe(10000);
  });
});

describe("fee piattaforma", () => {
  it("tiene a zero la commissione di piattaforma sui preventivi", () => {
    expect(CONNECT_APPLICATION_FEE_AMOUNT).toBe(0);
  });
});


const depositSnapshot = {
  depositMode: "percent" as const,
  depositBp: 3000,
  depositCents: null,
  amountDueCents: 3000,
  totalCents: 10000,
};

describe("scelta acconto, totale e saldo", () => {
  it("calcola il saldo rimanente dopo un acconto", () => {
    expect(remainingBalanceCents(10000, 3000)).toBe(7000);
    expect(remainingBalanceCents(10000, 10000)).toBe(0);
  });

  it("offre acconto e totale prima del pagamento, e solo il saldo dopo l'acconto", () => {
    expect(availablePaymentChoices(depositSnapshot, "awaiting", 0)).toEqual(["deposit", "full"]);
    expect(availablePaymentChoices(depositSnapshot, "deposit_paid", 3000)).toEqual(["balance"]);
    expect(availablePaymentChoices(depositSnapshot, "paid", 10000)).toEqual([]);
    expect(availablePaymentChoices({ ...depositSnapshot, depositMode: "full", amountDueCents: 10000 }, "awaiting", 0)).toEqual(["full"]);
  });

  it("calcola gli importi lato server e rifiuta una seconda volta l'acconto", () => {
    const deposit = resolvePaymentCharge({ snapshot: depositSnapshot, status: "awaiting", amountPaidCents: 0, choice: "deposit" });
    expect(deposit).toEqual({ ok: true, choice: "deposit", amountCents: 3000, nextStatus: "deposit_paid" });
    const full = resolvePaymentCharge({ snapshot: depositSnapshot, status: "awaiting", amountPaidCents: 0, choice: "full" });
    expect(full).toEqual({ ok: true, choice: "full", amountCents: 10000, nextStatus: "paid" });
    const balance = resolvePaymentCharge({ snapshot: depositSnapshot, status: "deposit_paid", amountPaidCents: 3000, choice: "balance" });
    expect(balance).toEqual({ ok: true, choice: "balance", amountCents: 7000, nextStatus: "paid" });
    const again = resolvePaymentCharge({ snapshot: depositSnapshot, status: "deposit_paid", amountPaidCents: 3000, choice: "deposit" });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.message).toMatch(/acconto è già stato pagato/i);
  });

  it("riconosce la scelta dall'importo incassato", () => {
    expect(inferPaymentChoice(depositSnapshot, "awaiting", 0, 3000)).toBe("deposit");
    expect(inferPaymentChoice(depositSnapshot, "awaiting", 0, 10000)).toBe("full");
    expect(inferPaymentChoice(depositSnapshot, "deposit_paid", 3000, 7000)).toBe("balance");
    expect(inferPaymentChoice(depositSnapshot, "deposit_paid", 3000, 3000)).toBeNull();
  });
});
