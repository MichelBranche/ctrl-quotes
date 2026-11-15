import { billingIntervalLabel, plans, type BillingInterval, type PlanId } from "./plans";

/** Metadata `app` on every Stripe object this product creates, so a shared account can later host other CTRL apps. */
export const STRIPE_APP = "ctrl-quotes";

/** Plans that can be purchased: all three, monthly or yearly. */
export const paidCheckoutPlanIds = ["starter", "pro", "business"] as const;
export type PaidCheckoutPlanId = (typeof paidCheckoutPlanIds)[number];

export function isPaidCheckoutPlan(value: string): value is PaidCheckoutPlanId {
  return value === "starter" || value === "pro" || value === "business";
}

/**
 * Lookup keys for monthly and yearly prices, namespaced so a shared Stripe account can also hold
 * other CTRL products later.
 */
export const stripePriceLookupKeys: Record<PaidCheckoutPlanId, { monthly: string; yearly: string }> = {
  starter: { monthly: "ctrl_quotes_starter_monthly", yearly: "ctrl_quotes_starter_yearly" },
  pro: { monthly: "ctrl_quotes_pro_monthly", yearly: "ctrl_quotes_pro_yearly" },
  business: { monthly: "ctrl_quotes_business_monthly", yearly: "ctrl_quotes_business_yearly" },
};

export const stripePriceEnvNames: Record<PaidCheckoutPlanId, { monthly: string; yearly: string }> = {
  starter: { monthly: "STRIPE_PRICE_STARTER_MONTHLY", yearly: "STRIPE_PRICE_STARTER_YEARLY" },
  pro: { monthly: "STRIPE_PRICE_PRO_MONTHLY", yearly: "STRIPE_PRICE_PRO_YEARLY" },
  business: { monthly: "STRIPE_PRICE_BUSINESS_MONTHLY", yearly: "STRIPE_PRICE_BUSINESS_YEARLY" },
};

export function intervalFromPriceId(
  priceId: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): BillingInterval | null {
  if (!priceId) return null;
  for (const planId of paidCheckoutPlanIds) {
    if (priceId === env[stripePriceEnvNames[planId].yearly]?.trim()) return "yearly";
    if (priceId === env[stripePriceEnvNames[planId].monthly]?.trim()) return "monthly";
  }
  return null;
}

export function intervalFromLookupKey(lookup: string | null | undefined): BillingInterval | null {
  if (!lookup) return null;
  for (const planId of paidCheckoutPlanIds) {
    if (lookup === stripePriceLookupKeys[planId].yearly) return "yearly";
    if (lookup === stripePriceLookupKeys[planId].monthly) return "monthly";
  }
  return null;
}

/**
 * `workspaces.plan` stores Business as `studio` (legacy name). Paid Starter stays `free` in the row
 * (the column CHECK only allows free/pro/studio and rebuilding that table is not worth the risk):
 * the live subscription with plan `starter` is what marks it as paid, and workspace summaries
 * surface it as `starter`.
 */
export function workspacePlanValue(planId: PaidCheckoutPlanId): "free" | "pro" | "studio" {
  if (planId === "business") return "studio";
  if (planId === "pro") return "pro";
  return "free";
}

/** Summary plan value: the row value, or `starter` for a `free` row with a live Starter subscription. */
export function summaryPlanValue(rowPlan: string, sub: { plan: string | null; status: string | null } | null | undefined): string {
  if (rowPlan === "free" && sub?.plan === "starter" && sub.status && ["active", "trialing", "past_due"].includes(sub.status)) return "starter";
  return rowPlan;
}

export function paidPlanFromWorkspacePlan(plan: string): PaidCheckoutPlanId | null {
  if (plan === "starter") return "starter";
  if (plan === "pro") return "pro";
  if (plan === "studio") return "business";
  return null;
}

export function stripeProductName(planId: PaidCheckoutPlanId): string {
  return plans[planId].name;
}

export type BillingStatus = "trial" | "trial_expired" | "active" | "canceling" | "past_due";

export function billingStatusLabel(status: BillingStatus, periodEndLabel?: string | null): string {
  switch (status) {
    case "active":
      return "Attivo";
    case "canceling":
      return periodEndLabel ? `In scadenza il ${periodEndLabel}` : "In scadenza";
    case "past_due":
      return "Pagamento fallito";
    case "trial_expired":
      return "Prova terminata";
    default:
      return "Piano di prova";
  }
}

export function paidPlanIntervalLabel(interval: BillingInterval | null): string | null {
  return interval ? billingIntervalLabel(interval) : null;
}

export const overSeatCapMessage =
  "Questo workspace ha più persone del limite del piano. I membri restano, ma non puoi invitarne altre finché non passi a un piano con più posti o riduci il team.";

export type BillingClientState = {
  checkoutEnabled: boolean;
  isOwner: boolean;
  status: BillingStatus;
  statusLabel: string;
  planId: PlanId;
  planLabel: string;
  paidPlanId: PaidCheckoutPlanId | null;
  interval: BillingInterval | null;
  intervalLabel: string | null;
  periodEnd: string | null;
  periodEndLabel: string | null;
  overSeatCap: boolean;
  hasSubscription: boolean;
  trialEndsAt: string | null;
  trialEndsLabel: string | null;
  trialDaysLeft: number | null;
  trialExpired: boolean;
};
