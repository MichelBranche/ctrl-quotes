import { workspaceEntitlement, hasLiveSubscription, type EntitlementInput } from "@/domain/entitlement";
import type { PlanId } from "@/domain/plans";
import { paidPlanFromWorkspacePlan } from "@/domain/stripe-plans";

export const ECOSYSTEM_ACCESS_STATUSES = [
  "lifetime",
  "paid",
  "redeem",
  "trial_active",
  "trial_expired",
  "none",
] as const;

export type EcosystemAccessStatus = (typeof ECOSYSTEM_ACCESS_STATUSES)[number];

export type WorkspaceAccessClass = {
  status: EcosystemAccessStatus;
  planId: PlanId;
  trialEndsAt: Date | null;
  overrideUntil: Date | null;
  hasPaidAccess: boolean;
};

const STATUS_RANK: Record<EcosystemAccessStatus, number> = {
  paid: 5,
  lifetime: 4,
  redeem: 3,
  trial_active: 2,
  trial_expired: 1,
  none: 0,
};

function asDate(value: Date | number | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Access label for a workspace, aligned with workspaceEntitlement and the existing
 * ecosystem aggregates (lifetime = planOverride set and planOverrideUntil null).
 */
export function classifyWorkspaceAccess(input: EntitlementInput, now = new Date()): WorkspaceAccessClass {
  const entitlement = workspaceEntitlement(input, now);
  const lifetime = Boolean(input.planOverride && input.planOverrideUntil == null);
  const paid = Boolean(
    hasLiveSubscription(input.subscriptionStatus) || paidPlanFromWorkspacePlan(input.plan),
  );
  let status: EcosystemAccessStatus;
  if (lifetime) status = "lifetime";
  else if (paid) status = "paid";
  else if (entitlement.hasPaidAccess) status = "redeem";
  else if (entitlement.trialActive) status = "trial_active";
  else if (entitlement.trialExpired) status = "trial_expired";
  else status = "none";
  return {
    status,
    planId: entitlement.planId,
    trialEndsAt: entitlement.trialEndsAt,
    overrideUntil: asDate(input.planOverrideUntil),
    hasPaidAccess: entitlement.hasPaidAccess,
  };
}

/** Best access a person has across their workspaces (paid first, then lifetime, and so on). */
export function primaryAccessStatus(statuses: readonly EcosystemAccessStatus[]): EcosystemAccessStatus {
  let best: EcosystemAccessStatus = "none";
  for (const status of statuses) {
    if (STATUS_RANK[status] > STATUS_RANK[best]) best = status;
  }
  return best;
}

export function toIso(value: Date | number | null | undefined): string | null {
  const date = asDate(value);
  return date ? date.toISOString() : null;
}
