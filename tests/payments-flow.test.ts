import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { quotePaymentSettings } from "@/db/schema";
import { markQuotePaid, recordStripePayment } from "@/server/payments";
import { createTestDb } from "./helpers/db";
import { ownerWithWorkspace } from "./helpers/actors";

function snapshot(total = 10000, due = 3000) {
  return {
    methods: ["iban", "stripe"],
    depositMode: "percent",
    depositBp: 3000,
    depositCents: null,
    amountDueCents: due,
    totalCents: total,
    showBeforeAcceptance: true,
    iban: { holder: "Studio", iban: "IT60X0542811101000000123456", bic: null, causale: "Preventivo 1" },
    paypal: null,
    stripe: { ready: true },
  };
}

describe("pagamenti preventivo: acconto, totale e saldo", () => {
  it("registra l'acconto Stripe e poi il saldo, senza riproporre l'acconto", async () => {
    const db = await createTestDb();
    const actor = await ownerWithWorkspace(db, "pagamenti@example.com", "Studio Pagamenti");
    const { createClient } = await import("@/server/clients");
    const { createCatalogItem } = await import("@/server/catalog");
    const { createQuote } = await import("@/server/quotes");
    function must<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
      if (!result.ok) throw new Error(result.message);
      return result.value;
    }
    const clientId = must(await createClient(db, actor, { kind: "azienda", name: "Atelier", email: "a@atelier.example" })).id;
    const itemId = must(await createCatalogItem(db, actor, { type: "servizio", name: "Design", unitPriceCents: 10000, taxRateBp: 2200 })).id;
    const quoteId = must(await createQuote(db, actor, { clientId, title: "Sito", catalogItemIds: [itemId] })).id;
    const now = new Date("2026-11-27T10:00:00Z");
    await db.insert(quotePaymentSettings).values({
      workspaceId: actor.workspaceId,
      quoteId,
      methods: JSON.stringify(["iban", "stripe"]),
      depositMode: "percent",
      depositBp: 3000,
      showBeforeAcceptance: true,
      snapshotJson: JSON.stringify(snapshot()),
      paymentStatus: "awaiting",
      amountDueCents: 3000,
      amountPaidCents: 0,
      updatedAt: now,
    });

    const deposit = await recordStripePayment(db, {
      workspaceId: actor.workspaceId,
      quoteId,
      amountCents: 3000,
      sessionId: "cs_deposit",
      paymentIntentId: "pi_deposit",
      choice: "deposit",
    });
    expect(deposit).toEqual({ status: "deposit_paid", changed: true });
    let [row] = await db.select().from(quotePaymentSettings).where(eq(quotePaymentSettings.quoteId, quoteId));
    expect(row).toMatchObject({ paymentStatus: "deposit_paid", amountPaidCents: 3000 });

    const replay = await recordStripePayment(db, {
      workspaceId: actor.workspaceId,
      quoteId,
      amountCents: 3000,
      sessionId: "cs_deposit",
      paymentIntentId: "pi_deposit",
      choice: "deposit",
    });
    expect(replay.changed).toBe(false);
    expect(replay.status).toBe("deposit_paid");

    const again = await recordStripePayment(db, {
      workspaceId: actor.workspaceId,
      quoteId,
      amountCents: 3000,
      sessionId: "cs_deposit_2",
      paymentIntentId: "pi_deposit_2",
      choice: "deposit",
    });
    expect(again.changed).toBe(false);

    const balance = await recordStripePayment(db, {
      workspaceId: actor.workspaceId,
      quoteId,
      amountCents: 7000,
      sessionId: "cs_balance",
      paymentIntentId: "pi_balance",
      choice: "balance",
    });
    expect(balance).toEqual({ status: "paid", changed: true });
    [row] = await db.select().from(quotePaymentSettings).where(eq(quotePaymentSettings.quoteId, quoteId));
    expect(row).toMatchObject({ paymentStatus: "paid", amountPaidCents: 10000 });
  });

  it("segna a mano acconto e poi saldo senza perdere l'importo già incassato", async () => {
    const db = await createTestDb();
    const actor = await ownerWithWorkspace(db, "studio@example.com", "Studio Manuale");
    const { createClient } = await import("@/server/clients");
    const { createCatalogItem } = await import("@/server/catalog");
    const { createQuote } = await import("@/server/quotes");
    function must<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
      if (!result.ok) throw new Error(result.message);
      return result.value;
    }
    const clientId = must(await createClient(db, actor, { kind: "azienda", name: "Nord", email: "n@example.com" })).id;
    const itemId = must(await createCatalogItem(db, actor, { type: "servizio", name: "Design", unitPriceCents: 10000, taxRateBp: 2200 })).id;
    const quoteId = must(await createQuote(db, actor, { clientId, title: "Sito", catalogItemIds: [itemId] })).id;
    const now = new Date("2026-11-27T10:00:00Z");
    await db.insert(quotePaymentSettings).values({
      workspaceId: actor.workspaceId,
      quoteId,
      methods: JSON.stringify(["iban"]),
      depositMode: "percent",
      depositBp: 3000,
      showBeforeAcceptance: true,
      snapshotJson: JSON.stringify({ ...snapshot(), methods: ["iban"], stripe: null }),
      paymentStatus: "awaiting",
      amountDueCents: 3000,
      amountPaidCents: 0,
      updatedAt: now,
    });

    const deposit = await markQuotePaid(db, actor, quoteId, "deposit_paid", "iban");
    expect(deposit.ok).toBe(true);
    if (!deposit.ok) return;
    expect(deposit.value.status).toBe("deposit_paid");
    let [row] = await db.select().from(quotePaymentSettings).where(eq(quotePaymentSettings.quoteId, quoteId));
    expect(row?.amountPaidCents).toBe(3000);

    const secondDeposit = await markQuotePaid(db, actor, quoteId, "deposit_paid", "iban");
    expect(secondDeposit.ok).toBe(false);

    const balance = await markQuotePaid(db, actor, quoteId, "paid", "iban");
    expect(balance.ok).toBe(true);
    if (!balance.ok) return;
    expect(balance.value.status).toBe("paid");
    [row] = await db.select().from(quotePaymentSettings).where(eq(quotePaymentSettings.quoteId, quoteId));
    expect(row?.amountPaidCents).toBe(10000);
  });
});
