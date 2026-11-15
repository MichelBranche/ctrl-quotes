import "server-only";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { subscriptions } from "@/db/schema";
import { currentPlanLabel, effectivePlanId, workspaceTeamSeatLimit } from "@/domain/plans";
import {
  billingStatusLabel,
  paidPlanFromWorkspacePlan,
  type BillingClientState,
  type BillingStatus,
  type PaidCheckoutPlanId,
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
  const override = workspace
    ? activePlanOverride(workspace.planOverride, workspace.planOverrideUntil, now.getTime())
    : null;
  const plan = workspace?.plan ?? "free";
  const planId = effectivePlanId(plan, override);
  const planLabel = currentPlanLabel(plan, override);
  const [sub] = workspace
    ? await db.select().from(subscriptions).where(eq(subscriptions.workspaceId, workspace.id)).limit(1)
    : [];

  let status: BillingStatus = "trial";
  if (sub && (sub.status === "past_due" || sub.status === "unpaid")) status = "past_due";
  else if (sub && sub.cancelAtPeriodEnd && (sub.status === "active" || sub.status === "trialing")) status = "canceling";
  else if (sub && (sub.status === "active" || sub.status === "trialing")) status = "active";
  else if (!override && plan === "free") status = "trial";
  else if (paidPlanFromWorkspacePlan(plan) || override) status = "active";

  const periodEnd = sub?.periodEnd ? sub.periodEnd.toISOString() : null;
  const periodEndLabel = sub?.periodEnd ? periodFormat.format(sub.periodEnd) : null;
  const seats = workspace ? await getSeatUsage(db, workspace.id, now) : null;
  const limit = seats?.limit ?? (workspace ? workspaceTeamSeatLimit(plan, override) : null);
  const used = seats?.used ?? 0;
  const overSeatCap = limit != null && used > limit;

  return {
    checkoutEnabled: stripeConfigured(env),
    isOwner: can(role, "billing.manage"),
    status,
    statusLabel: billingStatusLabel(status, periodEndLabel),
    planId,
    planLabel,
    paidPlanId: sub?.plan === "pro" || sub?.plan === "business" ? sub.plan : paidPlanFromWorkspacePlan(plan),
    periodEnd,
    periodEndLabel,
    overSeatCap,
    hasSubscription: Boolean(sub?.stripeSubscriptionId) && sub?.status !== "canceled" && sub?.status !== "none",
  };
}
