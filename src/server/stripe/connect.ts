import "server-only";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
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

/** Express + Managed Risk (losses_collector = stripe) requires the preview Accounts v2 version. The SDK default (`2026-10-28.endive`) rejects this combination. */
export const CONNECT_ACCOUNTS_API_VERSION = "2026-10-28.preview";

export const CONNECT_ONBOARDING_REFRESH_PATH = "/app/settings/payments?stripe=riparti";
export const CONNECT_ONBOARDING_RETURN_PATH = "/app/settings/payments?stripe=ritorno";

export function connectRequestOptions(): Stripe.RequestOptions {
  return { apiVersion: CONNECT_ACCOUNTS_API_VERSION } as Stripe.RequestOptions;
}

export function connectWebhookSecretConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim());
}

export function appBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "https://quotes.ctrlagency.dev";
  return raw.replace(/\/$/, "");
}

export function connectAccountCreateParams(input: {
  workspaceId: string;
  name: string;
  email?: string | null;
}): Stripe.V2.Core.AccountCreateParams {
  return {
    display_name: input.name,
    contact_email: input.email?.trim() || undefined,
    dashboard: "express",
    identity: { country: "IT" },
    defaults: {
      currency: "eur",
      responsibilities: {
        fees_collector: "stripe",
        losses_collector: "stripe",
      },
    },
    configuration: {
      merchant: {
        capabilities: {
          card_payments: { requested: true },
        },
      },
    },
    metadata: stripeAppMetadata({ workspace_id: input.workspaceId }),
  };
}

export function connectAccountLinkCreateParams(
  accountId: string,
  baseUrl = appBaseUrl(),
): Stripe.V2.Core.AccountLinkCreateParams {
  return {
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        refresh_url: `${baseUrl}${CONNECT_ONBOARDING_REFRESH_PATH}`,
        return_url: `${baseUrl}${CONNECT_ONBOARDING_RETURN_PATH}`,
      },
    },
  };
}

export async function createConnectedExpressAccount(
  stripe: Stripe,
  input: { workspaceId: string; name: string; email?: string | null },
): Promise<Stripe.V2.Core.Account> {
  return stripe.v2.core.accounts.create(connectAccountCreateParams(input), connectRequestOptions());
}

export async function createConnectOnboardingLink(stripe: Stripe, accountId: string, baseUrl = appBaseUrl()): Promise<string> {
  const link = await stripe.v2.core.accountLinks.create(connectAccountLinkCreateParams(accountId, baseUrl), connectRequestOptions());
  if (!link.url) throw new Error("Stripe non ha restituito l'indirizzo di onboarding.");
  return link.url;
}

export async function retrieveConnectedAccount(stripe: Stripe, accountId: string): Promise<unknown> {
  try {
    return await stripe.v2.core.accounts.retrieve(
      accountId,
      { include: ["configuration.merchant", "defaults", "identity", "requirements"] },
      connectRequestOptions(),
    );
  } catch {
    return stripe.accounts.retrieve(accountId);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function cardPaymentsStatus(account: unknown): string | null {
  const root = asRecord(account);
  if (!root) return null;
  const merchant = asRecord(asRecord(root.configuration)?.merchant);
  const capabilities = asRecord(merchant?.capabilities);
  const card = asRecord(capabilities?.card_payments);
  const status = card?.status;
  return typeof status === "string" ? status : null;
}

export function statusFromAccount(account: unknown): StripeConnectStatus {
  const root = asRecord(account) ?? {};
  if (root.charges_enabled === true || cardPaymentsStatus(account) === "active") return "active";
  return "pending";
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

function isChargesDisabledError(error: unknown): boolean {
  const lower = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    lower.includes("cannot currently make charges") ||
    lower.includes("charges are disabled") ||
    lower.includes("account cannot currently") ||
    (lower.includes("card_payments") && lower.includes("restrict"))
  );
}

function connectOnboardingErrorMessage(error: unknown): string {
  if (isConnectNotEnabledError(error)) {
    return "Stripe Connect non è ancora attivo su questo account piattaforma. Aprilo dalla Dashboard in modalità test (Impostazioni, Connect) e accetta i termini. I passaggi precisi sono nella guida in pagina.";
  }
  const lower = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (lower.includes("legacy") && lower.includes("type")) {
    return "Stripe ha aggiornato Connect: riprova. Se il problema continua, scrivici.";
  }
  return "Non è stato possibile avviare il collegamento Stripe. Riprova tra poco.";
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
    const account = await retrieveConnectedAccount(getStripe(), row.stripeAccountId);
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
  const row = await getWorkspacePaymentRow(db, access.value.id);
  let accountId = row?.stripeAccountId ?? null;
  try {
    if (!accountId) {
      const account = await createConnectedExpressAccount(stripe, {
        workspaceId: access.value.id,
        name: access.value.name,
        email,
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
    const url = await createConnectOnboardingLink(stripe, accountId);
    const status = await refreshConnectedAccountStatus(db, access.value.id);
    return ok({ url, status });
  } catch (error) {
    safeLog("error", "Stripe Connect: onboarding non riuscito", { workspaceId: access.value.id });
    return invalid(connectOnboardingErrorMessage(error));
  }
}

export async function createQuoteCheckoutSession(input: {
  connectedAccountId: string;
  workspaceId: string;
  quoteId: string;
  title: string;
  number: string | null;
  amountCents: number;
  paymentChoice?: string;
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
    metadata: stripeAppMetadata({
      workspace_id: input.workspaceId,
      quote_id: input.quoteId,
      ...(input.paymentChoice ? { payment_choice: input.paymentChoice } : {}),
    }),
    payment_intent_data: {
      metadata: stripeAppMetadata({
        workspace_id: input.workspaceId,
        quote_id: input.quoteId,
        ...(input.paymentChoice ? { payment_choice: input.paymentChoice } : {}),
      }),
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
    if (isChargesDisabledError(error)) {
      return invalid("L'account Stripe non può ancora accettare pagamenti con carta. Completa la verifica in Impostazioni, Pagamenti.");
    }
    safeLog("error", "Stripe Connect: checkout non riuscito", { workspaceId: input.workspaceId, quoteId: input.quoteId });
    return invalid("Non è stato possibile aprire il pagamento con carta. Riprova tra poco.");
  }
}
