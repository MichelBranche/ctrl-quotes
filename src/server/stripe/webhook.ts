import "server-only";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { stripeProcessedEvents, subscriptions, workspaces } from "@/db/schema";
import { createId } from "@/domain/ids";
import {
  isPaidCheckoutPlan,
  paidPlanFromWorkspacePlan,
  stripePriceEnvNames,
  stripePriceLookupKeys,
  workspacePlanValue,
  type PaidCheckoutPlanId,
} from "@/domain/stripe-plans";
import { writeAuditLog } from "@/server/audit";

export type StripeLikeEvent = {
  id: string;
  type: string;
  data: { object: object };
};

export type ApplyStripeEventResult = { applied: boolean; skipped: boolean; workspaceId: string | null };

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataOf(object: Record<string, unknown>): Record<string, string> {
  const raw = object.metadata;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function unixToDate(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000);
}

export function planFromStripeObject(
  object: Record<string, unknown>,
  env: Record<string, string | undefined> = process.env,
): PaidCheckoutPlanId | null {
  const meta = metadataOf(object);
  if (isPaidCheckoutPlan(meta.plan)) return meta.plan;
  const items = (object.items as { data?: Array<{ price?: Record<string, unknown> }> } | undefined)?.data ?? [];
  const price = items[0]?.price ?? (object.price as Record<string, unknown> | undefined);
  const lookup = asString(price?.lookup_key);
  if (lookup === stripePriceLookupKeys.pro.monthly || lookup === stripePriceLookupKeys.pro.yearly) return "pro";
  if (lookup === stripePriceLookupKeys.business.monthly || lookup === stripePriceLookupKeys.business.yearly) return "business";
  const priceId = asString(price?.id);
  if (priceId && (priceId === env[stripePriceEnvNames.pro.monthly]?.trim() || priceId === env[stripePriceEnvNames.pro.yearly]?.trim())) return "pro";
  if (priceId && (priceId === env[stripePriceEnvNames.business.monthly]?.trim() || priceId === env[stripePriceEnvNames.business.yearly]?.trim())) return "business";
  return null;
}

function subscriptionStatus(value: string | null, fallback = "active"): string {
  if (!value) return fallback;
  return value;
}

async function existingWorkspaceId(db: AppDatabase, candidate: string | null): Promise<string | null> {
  if (!candidate) return null;
  const [row] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, candidate)).limit(1);
  return row?.id ?? null;
}

async function findWorkspaceId(
  db: AppDatabase,
  object: Record<string, unknown>,
): Promise<string | null> {
  const meta = metadataOf(object);
  const fromMeta = await existingWorkspaceId(db, meta.workspace_id ?? null);
  if (fromMeta) return fromMeta;
  const parent = object.subscription && typeof object.subscription === "object" ? (object.subscription as Record<string, unknown>) : null;
  const fromParent = await existingWorkspaceId(db, parent ? metadataOf(parent).workspace_id ?? null : null);
  if (fromParent) return fromParent;
  const subscriptionId =
    asString(object.subscription) ??
    (object.object === "subscription" ? asString(object.id) : null);
  const customerId = asString(object.customer);
  if (subscriptionId) {
    const [row] = await db
      .select({ workspaceId: subscriptions.workspaceId })
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
      .limit(1);
    if (row) return row.workspaceId;
  }
  if (customerId) {
    const [row] = await db
      .select({ workspaceId: subscriptions.workspaceId })
      .from(subscriptions)
      .where(eq(subscriptions.stripeCustomerId, customerId))
      .limit(1);
    if (row) return row.workspaceId;
  }
  return null;
}

async function upsertSubscription(
  db: AppDatabase,
  input: {
    workspaceId: string;
    customerId: string | null;
    subscriptionId: string | null;
    status: string;
    plan: PaidCheckoutPlanId | null;
    periodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    priceId: string | null;
    now: Date;
  },
): Promise<void> {
  const [existing] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, input.workspaceId))
    .limit(1);
  const values = {
    stripeCustomerId: input.customerId,
    stripeSubscriptionId: input.subscriptionId,
    status: input.status,
    plan: input.plan,
    periodEnd: input.periodEnd,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    stripePriceId: input.priceId,
    updatedAt: input.now,
  };
  if (existing) {
    await db.update(subscriptions).set(values).where(eq(subscriptions.id, existing.id));
    return;
  }
  await db.insert(subscriptions).values({
    id: createId(),
    workspaceId: input.workspaceId,
    createdAt: input.now,
    ...values,
  });
}

async function applyWorkspacePlan(
  db: AppDatabase,
  workspaceId: string,
  plan: PaidCheckoutPlanId | null,
  now: Date,
): Promise<void> {
  const [workspace] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace) return;
  await db
    .update(workspaces)
    .set({
      plan: plan ? workspacePlanValue(plan) : "free",
      updatedAt: now,
    })
    .where(eq(workspaces.id, workspaceId));
}

/**
 * Applies a verified Stripe event. Idempotent on event id. Never deletes memberships
 * when a plan downgrades or is canceled.
 */
export async function applyStripeEvent(
  db: AppDatabase,
  event: StripeLikeEvent,
  env: Record<string, string | undefined> = process.env,
  now = new Date(),
): Promise<ApplyStripeEventResult> {
  try {
    await db.insert(stripeProcessedEvents).values({
      eventId: event.id,
      type: event.type,
      workspaceId: null,
      createdAt: now,
    });
  } catch {
    return { applied: false, skipped: true, workspaceId: null };
  }

  try {
    return await applyRecordedStripeEvent(db, event, env, now);
  } catch (error) {
    await db.delete(stripeProcessedEvents).where(eq(stripeProcessedEvents.eventId, event.id));
    throw error;
  }
}

async function applyRecordedStripeEvent(
  db: AppDatabase,
  event: StripeLikeEvent,
  env: Record<string, string | undefined>,
  now: Date,
): Promise<ApplyStripeEventResult> {
  const object = (event.data.object ?? {}) as Record<string, unknown>;
  let workspaceId: string | null = null;
  let applied = false;

  if (event.type === "checkout.session.completed") {
    workspaceId = await findWorkspaceId(db, object);
    const metaPlan = metadataOf(object).plan;
    const plan = isPaidCheckoutPlan(metaPlan) ? metaPlan : planFromStripeObject(object, env);
    const subscriptionId = asString(object.subscription);
    const customerId = asString(object.customer);
    if (workspaceId) {
      await upsertSubscription(db, {
        workspaceId,
        customerId,
        subscriptionId,
        status: "active",
        plan,
        periodEnd: null,
        cancelAtPeriodEnd: false,
        priceId: null,
        now,
      });
      await applyWorkspacePlan(db, workspaceId, plan, now);
      applied = true;
    }
  } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    workspaceId = await findWorkspaceId(db, object);
    const status = subscriptionStatus(asString(object.status));
    const plan = planFromStripeObject(object, env);
    const canceled = status === "canceled" || status === "incomplete_expired";
    const items = (object.items as { data?: Array<{ price?: Record<string, unknown> }> } | undefined)?.data ?? [];
    if (workspaceId) {
      await upsertSubscription(db, {
        workspaceId,
        customerId: asString(object.customer),
        subscriptionId: asString(object.id),
        status,
        plan: canceled ? plan : plan,
        periodEnd: unixToDate(object.current_period_end),
        cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
        priceId: asString(items[0]?.price?.id),
        now,
      });
      await applyWorkspacePlan(db, workspaceId, canceled ? null : plan, now);
      applied = true;
    }
  } else if (event.type === "customer.subscription.deleted") {
    workspaceId = await findWorkspaceId(db, object);
    if (workspaceId) {
      await upsertSubscription(db, {
        workspaceId,
        customerId: asString(object.customer),
        subscriptionId: asString(object.id),
        status: "canceled",
        plan: planFromStripeObject(object, env),
        periodEnd: unixToDate(object.current_period_end),
        cancelAtPeriodEnd: false,
        priceId: null,
        now,
      });
      await applyWorkspacePlan(db, workspaceId, null, now);
      applied = true;
    }
  } else if (event.type === "invoice.payment_failed") {
    const subscriptionId = asString(object.subscription);
    const invoice = object;
    workspaceId = await findWorkspaceId(db, invoice);
    if (workspaceId) {
      const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId)).limit(1);
      const plan =
        existing?.plan && isPaidCheckoutPlan(existing.plan)
          ? existing.plan
          : paidPlanFromWorkspacePlan(
              (await db.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1))[0]
                ?.plan ?? "free",
            );
      await upsertSubscription(db, {
        workspaceId,
        customerId: asString(object.customer) ?? existing?.stripeCustomerId ?? null,
        subscriptionId: subscriptionId ?? existing?.stripeSubscriptionId ?? null,
        status: "past_due",
        plan,
        periodEnd: existing?.periodEnd ?? null,
        cancelAtPeriodEnd: existing?.cancelAtPeriodEnd ?? false,
        priceId: existing?.stripePriceId ?? null,
        now,
      });
      applied = true;
    }
  }

  if (workspaceId) {
    await db
      .update(stripeProcessedEvents)
      .set({ workspaceId })
      .where(eq(stripeProcessedEvents.eventId, event.id));
    if (applied) {
      await writeAuditLog(db, {
        workspaceId,
        action: `billing.${event.type.replaceAll(".", "_")}`,
        entityType: "subscription",
        entityId: workspaceId,
      });
    }
  }

  return { applied, skipped: false, workspaceId };
}
