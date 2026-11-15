import "server-only";
import Stripe from "stripe";
import type { BillingInterval } from "@/domain/plans";
import { STRIPE_APP, stripePriceEnvNames, stripePriceLookupKeys, type PaidCheckoutPlanId } from "@/domain/stripe-plans";

export function stripeConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.STRIPE_SECRET_KEY?.trim());
}

export function webhookSecretConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.STRIPE_WEBHOOK_SECRET?.trim());
}

export function getStripe(env: Record<string, string | undefined> = process.env): Stripe {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Stripe non è configurato.");
  return new Stripe(key);
}

export function stripeAppMetadata(extra: Record<string, string> = {}): Record<string, string> {
  return { app: STRIPE_APP, ...extra };
}

export async function resolvePriceId(
  planId: PaidCheckoutPlanId,
  interval: BillingInterval = "monthly",
  env: Record<string, string | undefined> = process.env,
  stripe?: Stripe,
): Promise<string | null> {
  const fromEnv = env[stripePriceEnvNames[planId][interval]]?.trim();
  if (fromEnv) return fromEnv;
  if (!stripeConfigured(env)) return null;
  const lookup = stripePriceLookupKeys[planId][interval];
  const list = await (stripe ?? getStripe(env)).prices.list({ lookup_keys: [lookup], active: true, limit: 1 });
  return list.data[0]?.id ?? null;
}
