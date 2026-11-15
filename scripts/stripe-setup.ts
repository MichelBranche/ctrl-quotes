/**
 * Idempotently creates CTRL Quotes Stripe products and monthly prices from src/domain/plans.ts (test or live,
 * depending on the key). Lookup keys are namespaced (`ctrl_quotes_pro_monthly`). Metadata `app=ctrl-quotes`
 * is set on every object so a shared Stripe account can later host other CTRL products.
 *
 *   npm run stripe:setup
 *
 * Requires STRIPE_SECRET_KEY. Yearly prices are not created: plans.ts only defines monthly amounts.
 */
import Stripe from "stripe";
import { plans } from "../src/domain/plans.ts";
import {
  STRIPE_APP,
  paidCheckoutPlanIds,
  stripePriceLookupKeys,
  stripeProductName,
  type PaidCheckoutPlanId,
} from "../src/domain/stripe-plans.ts";

const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key) {
  console.error("Imposta STRIPE_SECRET_KEY (chiave sk_test_ o sk_live_) e riprova.");
  process.exit(1);
}

const stripe = new Stripe(key);
const currency = "eur";

async function findProductId(planId: PaidCheckoutPlanId): Promise<string | null> {
  let startingAfter: string | undefined;
  for (let step = 0; step < 10; step += 1) {
    const page = await stripe.products.list({ limit: 100, active: true, starting_after: startingAfter });
    const found = page.data.find((item) => item.metadata?.app === STRIPE_APP && item.metadata?.plan === planId);
    if (found) return found.id;
    if (!page.has_more || !page.data.length) return null;
    startingAfter = page.data[page.data.length - 1]?.id;
  }
  return null;
}

async function ensureProduct(planId: PaidCheckoutPlanId): Promise<string> {
  const name = stripeProductName(planId);
  const existingId = await findProductId(planId);
  if (existingId) {
    await stripe.products.update(existingId, { name, metadata: { app: STRIPE_APP, plan: planId } });
    return existingId;
  }
  const created = await stripe.products.create({
    name,
    description: plans[planId].body,
    metadata: { app: STRIPE_APP, plan: planId },
  });
  return created.id;
}

async function ensureMonthlyPrice(planId: PaidCheckoutPlanId, productId: string): Promise<{ id: string; created: boolean }> {
  const lookup_key = stripePriceLookupKeys[planId].monthly;
  const unit_amount = plans[planId].priceCents;
  const listed = await stripe.prices.list({ lookup_keys: [lookup_key], limit: 1 });
  const found = listed.data[0];
  if (found) {
    if (found.unit_amount !== unit_amount || found.currency !== currency) {
      throw new Error(
        `Il prezzo ${lookup_key} esiste già ma non coincide con plans.ts (${unit_amount} ${currency}). Non lo sovrascrivo: archivialo e riprova.`,
      );
    }
    if (found.metadata.app !== STRIPE_APP) {
      await stripe.prices.update(found.id, { metadata: { app: STRIPE_APP, plan: planId } });
    }
    return { id: found.id, created: false };
  }
  const created = await stripe.prices.create({
    product: productId,
    currency,
    unit_amount,
    recurring: { interval: "month" },
    lookup_key,
    metadata: { app: STRIPE_APP, plan: planId },
  });
  return { id: created.id, created: true };
}

async function ensurePortal(priceIds: string[]): Promise<string> {
  const list = await stripe.billingPortal.configurations.list({ limit: 20 });
  const existing = list.data.find((item) => item.metadata?.app === STRIPE_APP);
  const byProduct = new Map<string, string[]>();
  for (const priceId of priceIds) {
    const price = await stripe.prices.retrieve(priceId);
    const productId = typeof price.product === "string" ? price.product : price.product.id;
    const bucket = byProduct.get(productId) ?? [];
    bucket.push(priceId);
    byProduct.set(productId, bucket);
  }
  const features: Stripe.BillingPortal.ConfigurationCreateParams["features"] = {
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end" },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ["price"],
      proration_behavior: "create_prorations",
      products: [...byProduct.entries()].map(([product, prices]) => ({ product, prices })),
    },
  };

  if (existing) {
    const updated = await stripe.billingPortal.configurations.update(existing.id, {
      business_profile: { headline: "CTRL Quotes" },
      features,
    });
    return updated.id;
  }
  const created = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "CTRL Quotes" },
    features,
    metadata: { app: STRIPE_APP },
  });
  return created.id;
}

const summary: Array<{ plan: PaidCheckoutPlanId; lookup: string; priceId: string; amount: number; created: boolean }> = [];
const priceIds: string[] = [];
for (const planId of paidCheckoutPlanIds) {
  const productId = await ensureProduct(planId);
  const price = await ensureMonthlyPrice(planId, productId);
  priceIds.push(price.id);
  summary.push({
    plan: planId,
    lookup: stripePriceLookupKeys[planId].monthly,
    priceId: price.id,
    amount: plans[planId].priceCents,
    created: price.created,
  });
}

let portalId = "";
try {
  portalId = await ensurePortal(priceIds);
} catch (error) {
  console.error("Portale cliente: configurazione non completata.", error instanceof Error ? error.message : error);
}

console.log("Stripe setup CTRL Quotes (mensile, EUR, da plans.ts)");
console.log("Anno: nessuno, i prezzi annuali non sono definiti in plans.ts.");
for (const row of summary) {
  console.log(`${row.plan}: ${row.lookup} ${row.priceId} ${row.amount} cents (${row.created ? "creato" : "già presente"})`);
}
if (portalId) console.log(`portale: ${portalId}`);
console.log("Variabili da impostare:");
console.log(`STRIPE_PRICE_PRO_MONTHLY=${summary.find((row) => row.plan === "pro")?.priceId}`);
console.log(`STRIPE_PRICE_BUSINESS_MONTHLY=${summary.find((row) => row.plan === "business")?.priceId}`);
