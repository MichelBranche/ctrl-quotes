import "server-only";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { subscriptions } from "@/db/schema";
import { currentPlanLabel, workspaceTeamSeatLimit } from "@/domain/plans";
import { workspaceEntitlement } from "@/domain/entitlement";
import {
  billingStatusLabel,
  intervalFromPriceId,
  isPaidCheckoutPlan,
  paidPlanFromWorkspacePlan,
  paidPlanIntervalLabel,
  type BillingClientState,
  type BillingStatus,
} from "@/domain/stripe-plans";
import { can } from "@/domain/permissions";
import { activePlanOverride } from "@/domain/redeem";
import type { Actor } from "@/server/access";
import { getSeatUsage } from "@/server/invites";
import { getWorkspaceForUser } from "@/server/workspaces";
import { stripeConfigured } from "@/server/stripe/client";

const periodFormat = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Rome",
});

export async function loadBillingState(
  db: AppDatabase,
  actor: Actor,
  env: Record<string, string | undefined> = process.env,
  now = new Date(),
): Promise<BillingClientState> {
  const workspace = await getWorkspaceForUser(db, actor.userId, actor.workspaceId);
  const role = workspace?.role ?? "member";
  const [sub] = workspace
    ? await db.select().from(subscriptions).where(eq(subscriptions.workspaceId, workspace.id)).limit(1)
    : [];
  const access = workspaceEntitlement({
    plan: workspace?.plan ?? "free",
    planOverride: workspace?.planOverride ?? null,
    planOverrideUntil: workspace?.planOverrideUntil ?? null,
    trialEndsAt: workspace?.trialEndsAt ?? null,
    subscriptionStatus: sub?.status ?? null,
  }, now);
  const override = workspace
    ? activePlanOverride(workspace.planOverride, workspace.planOverrideUntil, now.getTime())
    : null;
  const plan = workspace?.plan ?? "free";
  const planId = access.planId;
  const planLabel = access.trialExpired
    ? "Prova terminata"
    : access.trialActive
      ? currentPlanLabel("free", override)
      : currentPlanLabel(plan, override);

  let status: BillingStatus = "trial";
  if (sub && (sub.status === "past_due" || sub.status === "unpaid")) status = "past_due";
  else if (sub && sub.cancelAtPeriodEnd && (sub.status === "active" || sub.status === "trialing")) status = "canceling";
  else if (sub && (sub.status === "active" || sub.status === "trialing")) status = "active";
  else if (access.hasPaidAccess) status = "active";
  else if (access.trialExpired) status = "trial_expired";
  else status = "trial";

  const periodEnd = sub?.periodEnd ? sub.periodEnd.toISOString() : null;
  const periodEndLabel = sub?.periodEnd ? periodFormat.format(sub.periodEnd) : null;
  const seats = workspace ? await getSeatUsage(db, workspace.id, now) : null;
  const limit = seats?.limit ?? (workspace ? workspaceTeamSeatLimit(plan, override) : null);
  const used = seats?.used ?? 0;
  const overSeatCap = limit != null && used > limit;
  const interval = intervalFromPriceId(sub?.stripePriceId, env);

  return {
    checkoutEnabled: stripeConfigured(env),
    isOwner: can(role, "billing.manage"),
    status,
    statusLabel: billingStatusLabel(status, periodEndLabel),
    planId,
    planLabel,
    paidPlanId: sub?.plan && isPaidCheckoutPlan(sub.plan) ? sub.plan : paidPlanFromWorkspacePlan(plan),
    interval,
    intervalLabel: paidPlanIntervalLabel(interval),
    periodEnd,
    periodEndLabel,
    overSeatCap,
    hasSubscription: Boolean(sub?.stripeSubscriptionId) && sub?.status !== "canceled" && sub?.status !== "none",
    trialEndsAt: access.trialEndsAt ? access.trialEndsAt.toISOString() : null,
    trialEndsLabel: access.trialEndsAt ? periodFormat.format(access.trialEndsAt) : null,
    trialDaysLeft: access.trialActive || access.trialExpired ? access.daysLeft : null,
    trialExpired: access.trialExpired,
  };
}
