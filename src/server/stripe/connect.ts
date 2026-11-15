import "server-only";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import type { AppDatabase } from "@/db/client";
import { workspacePaymentSettings } from "@/db/schema";
import { CONNECT_APPLICATION_FEE_AMOUNT, CONNECT_ENABLE_STEPS, asStripeConnectStatus, type StripeConnectStatus } from "@/domain/payments";
import { authorize, invalid, ok, type Actor, type Result } from "@/server/access";
import { writeAuditLog } from "@/server/audit";
import { getWorkspacePaymentRow } from "@/server/payments";
import { getStripe, stripeAppMetadata, stripeConfigured } from "@/server/stripe/client";
import { safeLog } from "@/server/redact";

export { CONNECT_ENABLE_STEPS };

export const CONNECT_NOT_ENABLED_CODE = "connect_not_enabled";

export function connectWebhookSecretConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim());
}

export function appBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "https://quotes.ctrlagency.dev";
  return raw.replace(/\/$/, "");
}

export function isConnectNotEnabledError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes("signed up for connect") ||
    lower.includes("not signed up for connect") ||
    lower.includes("connect is not enabled") ||
    lower.includes("you cannot create live-mode or test-mode accounts") ||
    (lower.includes("connect") && (lower.includes("enable") || lower.includes("platform")))
  );
}

export function statusFromAccount(account: { details_submitted?: boolean | null; charges_enabled?: boolean | null; payouts_enabled?: boolean | null }): StripeConnectStatus {
  if (account.charges_enabled) return "active";
  if (account.details_submitted) return "pending";
  return "pending";
}

async function upsertStripeAccount(
  db: AppDatabase,
  workspaceId: string,
  accountId: string,
  status: StripeConnectStatus,
): Promise<void> {
  const existing = await getWorkspacePaymentRow(db, workspaceId);
  const now = new Date();
  if (existing) {
    await db
      .update(workspacePaymentSettings)
      .set({ stripeAccountId: accountId, stripeAccountStatus: status, updatedAt: now })
      .where(eq(workspacePaymentSettings.workspaceId, workspaceId));
    return;
  }
  await db.insert(workspacePaymentSettings).values({
    workspaceId,
    stripeAccountId: accountId,
    stripeAccountStatus: status,
    updatedAt: now,
  });
}

export async function refreshConnectedAccountStatus(
  db: AppDatabase,
  workspaceId: string,
): Promise<StripeConnectStatus> {
  const row = await getWorkspacePaymentRow(db, workspaceId);
  if (!row?.stripeAccountId || !stripeConfigured()) return asStripeConnectStatus(row?.stripeAccountStatus);
  try {
    const account = await getStripe().accounts.retrieve(row.stripeAccountId);
    const status = statusFromAccount(account);
    if (status !== row.stripeAccountStatus) {
      await db
        .update(workspacePaymentSettings)
        .set({ stripeAccountStatus: status, updatedAt: new Date() })
        .where(eq(workspacePaymentSettings.workspaceId, workspaceId));
    }
    return status;
  } catch (error) {
    safeLog("warn", "Stripe Connect: lettura account non riuscita", { workspaceId, code: isConnectNotEnabledError(error) ? CONNECT_NOT_ENABLED_CODE : "retrieve_failed" });
    return asStripeConnectStatus(row.stripeAccountStatus);
  }
}

export type ConnectOnboarding = {
  url: string;
  status: StripeConnectStatus;
};

export async function startConnectOnboarding(db: AppDatabase, actor: Actor, email?: string | null): Promise<Result<ConnectOnboarding>> {
  const access = await authorize(db, actor, "settings.write");
  if (!access.ok) return access;
  if (!stripeConfigured()) return invalid("Stripe non è configurato sulla piattaforma.");
  const stripe = getStripe();
  let row = await getWorkspacePaymentRow(db, access.value.id);
  let accountId = row?.stripeAccountId ?? null;
  try {
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "IT",
        email: email?.trim() || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: stripeAppMetadata({ workspace_id: access.value.id }),
        business_profile: { name: access.value.name, product_description: "Incasso preventivi tramite CTRL Quotes" },
      });
      accountId = account.id;
      await upsertStripeAccount(db, access.value.id, accountId, statusFromAccount(account));
      await writeAuditLog(db, {
        workspaceId: access.value.id,
        actorUserId: actor.userId,
        action: "payments.stripe_account_created",
        entityType: "workspace",
        entityId: access.value.id,
        meta: { stripeAccountId: accountId },
      });
    }
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appBaseUrl()}/app/settings/payments?stripe=riparti`,
      return_url: `${appBaseUrl()}/app/settings/payments?stripe=ritorno`,
      type: "account_onboarding",
    });
    const status = await refreshConnectedAccountStatus(db, access.value.id);
    return ok({ url: link.url, status });
  } catch (error) {
    if (isConnectNotEnabledError(error)) {
      return invalid(
        "Stripe Connect non è ancora attivo su questo account piattaforma. Aprilo dalla Dashboard in modalità test (Impostazioni, Connect) e accetta i termini. I passaggi precisi sono nella guida in pagina.",
      );
    }
    safeLog("error", "Stripe Connect: onboarding non riuscito", { workspaceId: access.value.id });
    return invalid("Non è stato possibile avviare il collegamento Stripe. Riprova tra poco.");
  }
}

export async function createQuoteCheckoutSession(input: {
  connectedAccountId: string;
  workspaceId: string;
  quoteId: string;
  title: string;
  number: string | null;
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
}): Promise<Result<{ url: string; sessionId: string }>> {
  if (!stripeConfigured()) return invalid("I pagamenti con carta non sono disponibili al momento.");
  if (input.amountCents < 50) return invalid("L'importo minimo per il pagamento con carta è 0,50 €.");
  const fee = CONNECT_APPLICATION_FEE_AMOUNT;
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer_email: input.customerEmail?.trim() || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: input.amountCents,
          product_data: {
            name: [input.number, input.title].filter(Boolean).join(" · ") || "Preventivo",
          },
        },
      },
    ],
    metadata: stripeAppMetadata({ workspace_id: input.workspaceId, quote_id: input.quoteId }),
    payment_intent_data: {
      metadata: stripeAppMetadata({ workspace_id: input.workspaceId, quote_id: input.quoteId }),
      ...(fee > 0 ? { application_fee_amount: fee } : {}),
    },
  };
  try {
    const session = await getStripe().checkout.sessions.create(params, { stripeAccount: input.connectedAccountId });
    if (!session.url) return invalid("Stripe non ha restituito l'indirizzo di pagamento.");
    return ok({ url: session.url, sessionId: session.id });
  } catch (error) {
    if (isConnectNotEnabledError(error)) {
      return invalid("Stripe Connect non è attivo sulla piattaforma. Il pagamento con carta non è disponibile.");
    }
    safeLog("error", "Stripe Connect: checkout non riuscito", { workspaceId: input.workspaceId, quoteId: input.quoteId });
    return invalid("Non è stato possibile aprire il pagamento con carta. Riprova tra poco.");
  }
}
