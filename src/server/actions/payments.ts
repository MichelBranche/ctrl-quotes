"use server";

import { refresh } from "next/cache";
import { requireContext } from "@/server/context";
import { toAction, type ActionResult } from "@/server/actions/result";
import {
  getQuotePayments,
  getWorkspacePayments,
  markQuotePaid,
  saveQuotePayments,
  saveWorkspacePayments,
  type QuotePaymentsView,
  type WorkspacePaymentsView,
} from "@/server/payments";
import { refreshConnectedAccountStatus, startConnectOnboarding } from "@/server/stripe/connect";
import type { PaymentMethodId, PaymentStatus, StripeConnectStatus } from "@/domain/payments";

function id(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 64) : "";
}

export async function getWorkspacePaymentsAction(): Promise<ActionResult<WorkspacePaymentsView>> {
  const { db, actor } = await requireContext();
  return toAction(await getWorkspacePayments(db, actor));
}

export async function saveWorkspacePaymentsAction(input: unknown): Promise<ActionResult<WorkspacePaymentsView>> {
  const { db, actor } = await requireContext();
  const result = await saveWorkspacePayments(db, actor, input);
  if (result.ok) refresh();
  return toAction(result, "Impostazioni di pagamento salvate.");
}

export async function startStripeConnectAction(): Promise<ActionResult<{ url: string; status: StripeConnectStatus }>> {
  const { db, actor } = await requireContext();
  const result = await startConnectOnboarding(db, actor);
  if (result.ok) refresh();
  return toAction(result);
}

export async function refreshStripeConnectAction(): Promise<ActionResult<{ status: StripeConnectStatus }>> {
  const { db, actor, workspace } = await requireContext();
  const access = await getWorkspacePayments(db, actor);
  if (!access.ok) return toAction(access);
  const status = await refreshConnectedAccountStatus(db, workspace.id);
  refresh();
  return { ok: true, message: "Stato Stripe aggiornato.", value: { status } };
}

export async function getQuotePaymentsAction(quoteId: unknown): Promise<ActionResult<QuotePaymentsView>> {
  const { db, actor } = await requireContext();
  return toAction(await getQuotePayments(db, actor, id(quoteId)));
}

export async function saveQuotePaymentsAction(quoteId: unknown, input: unknown): Promise<ActionResult<QuotePaymentsView>> {
  const { db, actor } = await requireContext();
  const result = await saveQuotePayments(db, actor, id(quoteId), input);
  if (result.ok) refresh();
  return toAction(result);
}

export async function markQuotePaidAction(
  quoteId: unknown,
  input: { kind: "paid" | "deposit_paid"; method: PaymentMethodId },
): Promise<ActionResult<{ status: PaymentStatus }>> {
  const { db, actor } = await requireContext();
  const result = await markQuotePaid(db, actor, id(quoteId), input.kind, input.method);
  if (result.ok) refresh();
  return toAction(result, input.kind === "paid" ? "Pagamento registrato." : "Acconto registrato.");
}
