import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { stripeProcessedEvents, subscriptions, workspaces } from "@/db/schema";
import { createTestDb } from "./helpers/db";
import { joinAs, ownerWithWorkspace } from "./helpers/actors";
import { applyStripeEvent, planFromStripeObject, type StripeLikeEvent } from "@/server/stripe/webhook";
import { createWorkspaceInvite } from "@/server/invites";
import { listMembers } from "@/server/team";

const env = {
  STRIPE_PRICE_PRO_MONTHLY: "price_pro_test",
  STRIPE_PRICE_BUSINESS_MONTHLY: "price_biz_test",
  STRIPE_PRICE_PRO_YEARLY: "price_pro_year_test",
  STRIPE_PRICE_BUSINESS_YEARLY: "price_biz_year_test",
};

function event(id: string, type: string, object: Record<string, unknown>): StripeLikeEvent {
  return { id, type, data: { object } };
}

function subscriptionObject(input: {
  id?: string;
  workspaceId: string;
  plan?: "pro" | "business";
  status?: string;
  cancelAtPeriodEnd?: boolean;
  customer?: string;
  lookup?: string;
  priceId?: string;
  periodEnd?: number;
}): Record<string, unknown> {
  return {
    id: input.id ?? "sub_1",
    object: "subscription",
    customer: input.customer ?? "cus_1",
    status: input.status ?? "active",
    cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
    current_period_end: input.periodEnd ?? 1_800_000_000,
    metadata: { app: "ctrl-quotes", workspace_id: input.workspaceId, plan: input.plan ?? "pro" },
    items: {
      data: [
        {
          price: {
            id: input.priceId ?? "price_pro_test",
            lookup_key: input.lookup ?? "ctrl_quotes_pro_monthly",
          },
        },
      ],
    },
  };
}

describe("webhook Stripe", () => {
  it("mappa un checkout completato sul piano Pro e ignora un evento già processato", async () => {
    const db = await createTestDb();
    const owner = await ownerWithWorkspace(db, "owner@example.com", "Studio Stripe");
    const checkout = event("evt_checkout_1", "checkout.session.completed", {
      object: "checkout.session",
      customer: "cus_1",
      subscription: "sub_1",
      metadata: { app: "ctrl-quotes", workspace_id: owner.workspaceId, plan: "pro" },
    });
    const first = await applyStripeEvent(db, checkout, env);
    expect(first.applied).toBe(true);
    expect(first.skipped).toBe(false);
    const second = await applyStripeEvent(db, checkout, env);
    expect(second.skipped).toBe(true);
    expect(second.applied).toBe(false);

    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, owner.workspaceId));
    expect(workspace.plan).toBe("pro");
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.workspaceId, owner.workspaceId));
    expect(sub.status).toBe("active");
    expect(sub.plan).toBe("pro");
    expect(sub.stripeCustomerId).toBe("cus_1");
    expect(sub.stripeSubscriptionId).toBe("sub_1");
    const events = await db.select().from(stripeProcessedEvents);
    expect(events).toHaveLength(1);
  });

  it("aggiorna lo stato in scadenza e pagamento fallito, poi torna al Piano di prova senza togliere membri", async () => {
    const db = await createTestDb();
    const owner = await ownerWithWorkspace(db, "owner@example.com", "Studio Stripe");
    await joinAs(db, owner.workspaceId, "a@example.com", "member");
    await joinAs(db, owner.workspaceId, "b@example.com", "member");

    await applyStripeEvent(
      db,
      event("evt_sub_1", "customer.subscription.updated", subscriptionObject({ workspaceId: owner.workspaceId, plan: "business", lookup: "ctrl_quotes_business_monthly", priceId: "price_biz_test" })),
      env,
    );
    const [paid] = await db.select().from(workspaces).where(eq(workspaces.id, owner.workspaceId));
    expect(paid.plan).toBe("studio");

    await applyStripeEvent(
      db,
      event(
        "evt_sub_canceling",
        "customer.subscription.updated",
        subscriptionObject({ workspaceId: owner.workspaceId, plan: "pro", cancelAtPeriodEnd: true }),
      ),
      env,
    );
    const [subCanceling] = await db.select().from(subscriptions).where(eq(subscriptions.workspaceId, owner.workspaceId));
    expect(subCanceling.cancelAtPeriodEnd).toBe(true);
    expect(subCanceling.status).toBe("active");
    const [stillPaid] = await db.select().from(workspaces).where(eq(workspaces.id, owner.workspaceId));
    expect(stillPaid.plan).toBe("pro");

    await applyStripeEvent(
      db,
      event("evt_pay_fail", "invoice.payment_failed", {
        object: "invoice",
        customer: "cus_1",
        subscription: "sub_1",
        metadata: { app: "ctrl-quotes", workspace_id: owner.workspaceId },
      }),
      env,
    );
    const [pastDue] = await db.select().from(subscriptions).where(eq(subscriptions.workspaceId, owner.workspaceId));
    expect(pastDue.status).toBe("past_due");
    const [stillOnPlan] = await db.select().from(workspaces).where(eq(workspaces.id, owner.workspaceId));
    expect(stillOnPlan.plan).toBe("pro");

    await applyStripeEvent(
      db,
      event("evt_sub_deleted", "customer.subscription.deleted", subscriptionObject({ workspaceId: owner.workspaceId, status: "canceled" })),
      env,
    );
    const [free] = await db.select().from(workspaces).where(eq(workspaces.id, owner.workspaceId));
    expect(free.plan).toBe("free");
    const members = await listMembers(db, owner);
    expect(members.ok).toBe(true);
    if (members.ok) expect(members.value.members).toHaveLength(3);
  });

  it("dopo un downgrade con più membri del limite blocca i nuovi inviti e non rimuove nessuno", async () => {
    const db = await createTestDb();
    const owner = await ownerWithWorkspace(db, "owner@example.com", "Studio Stripe");
    for (const email of ["a@example.com", "b@example.com", "c@example.com", "d@example.com", "e@example.com", "f@example.com"]) {
      await joinAs(db, owner.workspaceId, email, "member");
    }
    await applyStripeEvent(
      db,
      event("evt_biz", "customer.subscription.updated", subscriptionObject({ workspaceId: owner.workspaceId, plan: "business", lookup: "ctrl_quotes_business_monthly", priceId: "price_biz_test" })),
      env,
    );
    await applyStripeEvent(
      db,
      event("evt_down", "customer.subscription.updated", subscriptionObject({ workspaceId: owner.workspaceId, plan: "pro" })),
      env,
    );
    const members = await listMembers(db, owner);
    expect(members.ok).toBe(true);
    if (members.ok) expect(members.value.members).toHaveLength(7);
    const invite = await createWorkspaceInvite(
      db,
      owner,
      { email: "nuovo@example.com", role: "member" },
      { origin: "https://quotes.ctrlagency.dev", send: async () => undefined },
    );
    expect(invite.ok).toBe(false);
    if (!invite.ok) expect(invite.message).toContain("limite");
  });

  it("registra l'evento di un workspace sconosciuto senza creare un abbonamento", async () => {
    const db = await createTestDb();
    const result = await applyStripeEvent(
      db,
      event("evt_unknown", "customer.subscription.updated", subscriptionObject({ workspaceId: "ws_does_not_exist", plan: "pro" })),
      env,
    );
    expect(result.applied).toBe(false);
    expect(result.skipped).toBe(false);
    expect(result.workspaceId).toBe(null);
    const rows = await db.select().from(subscriptions);
    expect(rows).toHaveLength(0);
    const events = await db.select().from(stripeProcessedEvents);
    expect(events).toHaveLength(1);
  });

  it("riconosce il piano dai lookup key e dagli id prezzo", () => {
    expect(planFromStripeObject({ metadata: { plan: "business" } }, env)).toBe("business");
    expect(
      planFromStripeObject({ items: { data: [{ price: { lookup_key: "ctrl_quotes_pro_monthly" } }] } }, env),
    ).toBe("pro");
    expect(planFromStripeObject({ items: { data: [{ price: { id: "price_biz_test" } }] } }, env)).toBe("business");
    expect(
      planFromStripeObject({ items: { data: [{ price: { lookup_key: "ctrl_quotes_pro_yearly" } }] } }, env),
    ).toBe("pro");
    expect(planFromStripeObject({ items: { data: [{ price: { id: "price_biz_year_test" } }] } }, env)).toBe("business");
  });
});
