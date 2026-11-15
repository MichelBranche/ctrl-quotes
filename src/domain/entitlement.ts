import {
  TRIAL_EXPIRED_WRITE_MESSAGE,
  TRIAL_PLAN_ID,
  TRIAL_REMINDER_DAYS_LEFT,
  effectivePlanId,
  trialDaysRemaining,
  trialReminderDue,
  type PlanId,
} from "@/domain/plans";
import { activePlanOverride } from "@/domain/redeem";
import { paidPlanFromWorkspacePlan } from "@/domain/stripe-plans";

export { TRIAL_EXPIRED_WRITE_MESSAGE };

export type EntitlementInput = {
  plan: string;
  planOverride: PlanId | string | null;
  planOverrideUntil: number | Date | null;
  trialEndsAt: Date | number | null;
  /** Stripe subscription status, if any (active, trialing, past_due, canceled, ...). */
  subscriptionStatus: string | null;
};

export type WorkspaceEntitlement = {
  planId: PlanId;
  trialEndsAt: Date | null;
  trialActive: boolean;
  trialExpired: boolean;
  daysLeft: number;
  showReminderBanner: boolean;
  readOnly: boolean;
  hasPaidAccess: boolean;
};

const LIVE_SUB = new Set(["active", "trialing", "past_due"]);

function asDate(value: Date | number | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

export function hasLiveSubscription(status: string | null | undefined): boolean {
  return Boolean(status && LIVE_SUB.has(status));
}

/**
 * Access and limits for a workspace. A missing trial end means the trial has not been started
 * (or the row predates the column in tests): it is not treated as expired.
 */
export function workspaceEntitlement(input: EntitlementInput, now = new Date()): WorkspaceEntitlement {
  const override = activePlanOverride(input.planOverride, input.planOverrideUntil, now.getTime());
  const paidPlan = paidPlanFromWorkspacePlan(input.plan);
  const hasPaidAccess = Boolean(override || paidPlan || hasLiveSubscription(input.subscriptionStatus));
  const trialEndsAt = asDate(input.trialEndsAt);
  const trialActive = Boolean(trialEndsAt && trialEndsAt.getTime() > now.getTime() && !hasPaidAccess);
  const trialExpired = Boolean(trialEndsAt && trialEndsAt.getTime() <= now.getTime() && !hasPaidAccess);
  const daysLeft = trialEndsAt && !hasPaidAccess ? trialDaysRemaining(trialEndsAt, now) : 0;
  const planId = override
    ? override
    : paidPlan
      ? effectivePlanId(input.plan)
      : trialActive || trialExpired || input.plan === "free"
        ? TRIAL_PLAN_ID
        : effectivePlanId(input.plan);
  return {
    planId,
    trialEndsAt,
    trialActive,
    trialExpired,
    daysLeft,
    showReminderBanner: Boolean(trialActive && trialReminderDue(trialEndsAt!, now, TRIAL_REMINDER_DAYS_LEFT)),
    readOnly: trialExpired,
    hasPaidAccess,
  };
}
