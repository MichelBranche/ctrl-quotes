import "server-only";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { subscriptions, user } from "@/db/schema";
import { createId } from "@/domain/ids";
import { BILLING_PATH, isBillingInterval, stripeSubscriptionTrialEnd, type BillingInterval } from "@/domain/plans";
import { loadWorkspaceEntitlement } from "@/server/entitlement";
import { isPaidCheckoutPlan, type PaidCheckoutPlanId } from "@/domain/stripe-plans";
import { authorize, invalid, type Actor, type Result } from "@/server/access";
import { writeAuditLog } from "@/server/audit";
import { createRateLimiter, rateRules } from "@/server/rate-limit";
import { getStripe, resolvePriceId, stripeAppMetadata, stripeConfigured } from "@/server/stripe/client";

export async function createCheckoutSession(
  db: AppDatabase,
  actor: Actor,
  planId: string,
  origin: string,
  interval: BillingInterval = "monthly",
  env: Record<string, string | undefined> = process.env,
): Promise<Result<{ url: string }>> {
  const access = await authorize(db, actor, "billing.manage");
  if (!access.ok) return access;
  if (!stripeConfigured(env)) return invalid("I pagamenti non sono ancora attivi.");
  if (!isPaidCheckoutPlan(planId)) return invalid("Puoi attivare il Piano Pro o il Piano Business.");
  const cycle: BillingInterval = isBillingInterval(interval) ? interval : "monthly";

  const limited = await createRateLimiter(db, env).hit(rateRules.checkout, actor.userId);
  if (!limited.ok) return invalid("Hai aperto troppe sessioni di pagamento. Riprova tra qualche minuto.");

  const stripe = getStripe(env);
  const priceId = await resolvePriceId(planId, cycle, env, stripe);
  if (!priceId) return invalid("Il prezzo di questo piano non è ancora configurato su Stripe.");

  const customerId = await ensureCustomer(db, stripe, actor, access.value.name, env);
  const base = origin.replace(/\/$/, "");
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: actor.workspaceId,
    success_url: `${base}${BILLING_PATH}?checkout=success`,
    cancel_url: `${base}${BILLING_PATH}?checkout=cancel`,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    metadata: stripeAppMetadata({ workspace_id: actor.workspaceId, plan: planId, interval: cycle }),
    subscription_data: await subscriptionDataForCheckout(db, access.value, { workspace_id: actor.workspaceId, plan: planId, interval: cycle }),
  });
  if (!session.url) return invalid("Stripe non ha restituito un indirizzo di pagamento. Riprova.");

  await writeAuditLog(db, {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action: "billing.checkout_started",
    entityType: "subscription",
    entityId: actor.workspaceId,
    meta: { plan: planId, interval: cycle },
  });

  return { ok: true, value: { url: session.url } };
}


async function subscriptionDataForCheckout(
  db: AppDatabase,
  workspace: Parameters<typeof loadWorkspaceEntitlement>[1],
  metadata: { workspace_id: string; plan: string; interval: string },
) {
  const data: { metadata: ReturnType<typeof stripeAppMetadata>; trial_end?: number } = {
    metadata: stripeAppMetadata(metadata),
  };
  const access = await loadWorkspaceEntitlement(db, workspace);
  if (access.trialActive) {
    const trialEnd = stripeSubscriptionTrialEnd(access.trialEndsAt);
    if (trialEnd) data.trial_end = trialEnd;
  }
  return data;
}

export async function createPortalSession(
  db: AppDatabase,
  actor: Actor,
  origin: string,
  env: Record<string, string | undefined> = process.env,
): Promise<Result<{ url: string }>> {
  const access = await authorize(db, actor, "billing.manage");
  if (!access.ok) return access;
  if (!stripeConfigured(env)) return invalid("I pagamenti non sono ancora attivi.");

  const limited = await createRateLimiter(db, env).hit(rateRules.checkout, actor.userId);
  if (!limited.ok) return invalid("Hai aperto troppe sessioni. Riprova tra qualche minuto.");

  const [row] = await db
    .select({ customerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, actor.workspaceId))
    .limit(1);
  if (!row?.customerId) return invalid("Non c'è ancora un abbonamento da gestire per questo workspace.");

  const stripe = getStripe(env);
  const session = await stripe.billingPortal.sessions.create({
    customer: row.customerId,
    return_url: `${origin.replace(/\/$/, "")}${BILLING_PATH}`,
  });
  if (!session.url) return invalid("Stripe non ha restituito il portale. Riprova.");
  return { ok: true, value: { url: session.url } };
}

async function ensureCustomer(
  db: AppDatabase,
  stripe: ReturnType<typeof getStripe>,
  actor: Actor,
  workspaceName: string,
  env: Record<string, string | undefined>,
): Promise<string> {
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, actor.workspaceId))
    .limit(1);
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const [actorUser] = await db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, actor.userId)).limit(1);
  const customer = await stripe.customers.create({
    email: actorUser?.email,
    name: actorUser?.name ?? workspaceName,
    metadata: stripeAppMetadata({ workspace_id: actor.workspaceId }),
    description: `CTRL Quotes · ${workspaceName}`,
  });

  const now = new Date();
  if (existing) {
    await db
      .update(subscriptions)
      .set({ stripeCustomerId: customer.id, updatedAt: now })
      .where(eq(subscriptions.id, existing.id));
  } else {
    await db.insert(subscriptions).values({
      id: createId(),
      workspaceId: actor.workspaceId,
      stripeCustomerId: customer.id,
      status: "none",
      createdAt: now,
      updatedAt: now,
    });
  }
  return customer.id;
}

export type { PaidCheckoutPlanId };
