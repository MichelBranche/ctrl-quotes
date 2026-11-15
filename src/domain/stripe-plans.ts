import { plans, type PlanId } from "./plans";

/** Metadata `app` on every Stripe object this product creates, so a shared account can later host other CTRL apps. */
export const STRIPE_APP = "ctrl-quotes";

/** Plans that can be purchased. Starter is the trial baseline and is not sold. */
export const paidCheckoutPlanIds = ["pro", "business"] as const;
export type PaidCheckoutPlanId = (typeof paidCheckoutPlanIds)[number];

export function isPaidCheckoutPlan(value: string): value is PaidCheckoutPlanId {
  return value === "pro" || value === "business";
}

/**
 * Lookup keys for monthly prices, namespaced so a shared Stripe account can also hold
 * other CTRL products later. Yearly is omitted: plans.ts only defines monthly amounts.
 */
export const stripePriceLookupKeys: Record<PaidCheckoutPlanId, { monthly: string }> = {
  pro: { monthly: "ctrl_quotes_pro_monthly" },
  business: { monthly: "ctrl_quotes_business_monthly" },
};

export const stripePriceEnvNames: Record<PaidCheckoutPlanId, { monthly: "STRIPE_PRICE_PRO_MONTHLY" | "STRIPE_PRICE_BUSINESS_MONTHLY" }> = {
  pro: { monthly: "STRIPE_PRICE_PRO_MONTHLY" },
  business: { monthly: "STRIPE_PRICE_BUSINESS_MONTHLY" },
};

/** `workspaces.plan` stores Business as `studio` (legacy name). */
export function workspacePlanValue(planId: PaidCheckoutPlanId): "pro" | "studio" {
  return planId === "business" ? "studio" : "pro";
}

export function paidPlanFromWorkspacePlan(plan: string): PaidCheckoutPlanId | null {
  if (plan === "pro") return "pro";
  if (plan === "studio") return "business";
  return null;
}

export function stripeProductName(planId: PaidCheckoutPlanId): string {
  return plans[planId].name;
}

export type BillingStatus = "trial" | "active" | "canceling" | "past_due";

export function billingStatusLabel(status: BillingStatus, periodEndLabel?: string | null): string {
  switch (status) {
    case "active":
      return "Attivo";
    case "canceling":
      return periodEndLabel ? `In scadenza il ${periodEndLabel}` : "In scadenza";
    case "past_due":
      return "Pagamento fallito";
    default:
      return "Piano di prova";
  }
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
  periodEnd: string | null;
  periodEndLabel: string | null;
  overSeatCap: boolean;
  hasSubscription: boolean;
};
