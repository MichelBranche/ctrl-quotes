import { describe, expect, it } from "vitest";
import { quotePaymentSettings, quotes, workspaces } from "@/db/schema";
import { createId } from "@/domain/ids";
import { CONNECT_APPLICATION_FEE_AMOUNT } from "@/domain/payments";
import { applyConnectEvent } from "@/server/stripe/connect-webhook";
import { applyStripeEvent } from "@/server/stripe/webhook";
import { createTestDb } from "./helpers/db";

function event(type: string, object: Record<string, unknown>, id = createId()) {
  return { id: `evt_${id}`, type, data: { object } };
}

describe("webhook Connect sui preventivi", () => {
  it("tiene a zero la commissione di piattaforma", () => {
    expect(CONNECT_APPLICATION_FEE_AMOUNT).toBe(0);
  });

  it("segna il preventivo come pagato in modo idempotente", async () => {
    const db = await createTestDb();
    const workspaceId = "ws_pay";
    const quoteId = "qt_pay";
    const now = new Date("2026-11-15T10:00:00Z");
    await db.insert(workspaces).values({
      id: workspaceId,
      name: "Studio",
      slug: "studio-pay",
      plan: "free",
      taxProfile: "ordinario",
      currency: "EUR",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(quotes).values({
      id: quoteId,
      workspaceId,
      title: "Sito web",
      status: "accepted",
      totalCents: 10000,
      recurringCents: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(quotePaymentSettings).values({
      workspaceId,
      quoteId,
      methods: JSON.stringify(["stripe"]),
      depositMode: "full",
      showBeforeAcceptance: false,
      snapshotJson: JSON.stringify({
        methods: ["stripe"],
        depositMode: "full",
        depositBp: null,
        depositCents: null,
        amountDueCents: 10000,
        totalCents: 10000,
        showBeforeAcceptance: false,
        iban: null,
        paypal: null,
        stripe: { ready: true },
      }),
      paymentStatus: "awaiting",
      amountDueCents: 10000,
      amountPaidCents: 0,
      updatedAt: now,
    });

    const ev = event("checkout.session.completed", {
      id: "cs_test_quote",
      mode: "payment",
      payment_status: "paid",
      amount_total: 10000,
      payment_intent: "pi_test_quote",
      metadata: { app: "ctrl-quotes", workspace_id: workspaceId, quote_id: quoteId },
    });
    const first = await applyConnectEvent(db, ev, now);
    expect(first.applied).toBe(true);
    const second = await applyConnectEvent(db, ev, now);
    expect(second.skipped).toBe(true);

    const [row] = await db.select().from(quotePaymentSettings);
    expect(row.paymentStatus).toBe("paid");
    expect(row.amountPaidCents).toBe(10000);
  });

  it("il webhook degli abbonamenti ignora un checkout di preventivo", async () => {
    const db = await createTestDb();
    const ev = event("checkout.session.completed", {
      id: "cs_test_quote_2",
      mode: "payment",
      metadata: { app: "ctrl-quotes", workspace_id: "ws_missing", quote_id: "qt_missing" },
    });
    const result = await applyStripeEvent(db, ev);
    expect(result.skipped).toBe(true);
    expect(result.applied).toBe(false);
  });
});
