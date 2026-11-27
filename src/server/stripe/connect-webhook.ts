import "server-only";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { stripeProcessedEvents, workspacePaymentSettings } from "@/db/schema";
import { recordStripePayment } from "@/server/payments";
import { statusFromAccount } from "@/server/stripe/connect";
import type { StripeLikeEvent } from "@/server/stripe/webhook";
import { safeLog } from "@/server/redact";

export type ApplyConnectEventResult = { applied: boolean; skipped: boolean; workspaceId: string | null };

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataOf(object: Record<string, unknown>): Record<string, string> {
  const raw = object.metadata;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

async function workspaceIdFromAccount(db: AppDatabase, accountId: string | null): Promise<string | null> {
  if (!accountId) return null;
  const [row] = await db
    .select({ workspaceId: workspacePaymentSettings.workspaceId })
    .from(workspacePaymentSettings)
    .where(eq(workspacePaymentSettings.stripeAccountId, accountId))
    .limit(1);
  return row?.workspaceId ?? null;
}

export async function applyConnectEvent(
  db: AppDatabase,
  event: StripeLikeEvent,
  now = new Date(),
): Promise<ApplyConnectEventResult> {
  try {
    await db.insert(stripeProcessedEvents).values({
      eventId: event.id,
      type: event.type,
      workspaceId: null,
      createdAt: now,
    });
  } catch {
    return { applied: false, skipped: true, workspaceId: null };
  }

  try {
    return await applyRecordedConnectEvent(db, event, now);
  } catch (error) {
    await db.delete(stripeProcessedEvents).where(eq(stripeProcessedEvents.eventId, event.id));
    throw error;
  }
}

async function applyRecordedConnectEvent(
  db: AppDatabase,
  event: StripeLikeEvent,
  now: Date,
): Promise<ApplyConnectEventResult> {
  const object = (event.data.object ?? {}) as Record<string, unknown>;
  const meta = metadataOf(object);

  if (event.type === "account.updated") {
    const accountId = asString(object.id);
    const workspaceId = await workspaceIdFromAccount(db, accountId);
    if (!workspaceId || !accountId) return { applied: false, skipped: false, workspaceId };
    const status = statusFromAccount(object);
    await db
      .update(workspacePaymentSettings)
      .set({ stripeAccountStatus: status, updatedAt: now })
      .where(eq(workspacePaymentSettings.workspaceId, workspaceId));
    return { applied: true, skipped: false, workspaceId };
  }

  if (event.type === "checkout.session.completed" || event.type === "payment_intent.succeeded") {
    if (event.type === "checkout.session.completed" && asString(object.mode) && object.mode !== "payment") {
      return { applied: false, skipped: true, workspaceId: meta.workspace_id ?? null };
    }
    if (event.type === "checkout.session.completed" && asString(object.payment_status) && object.payment_status !== "paid") {
      return { applied: false, skipped: true, workspaceId: meta.workspace_id ?? null };
    }
    const workspaceId = meta.workspace_id ?? null;
    const quoteId = meta.quote_id ?? null;
    if (!workspaceId || !quoteId) return { applied: false, skipped: false, workspaceId };
    const amount =
      typeof object.amount_total === "number"
        ? object.amount_total
        : typeof object.amount_received === "number"
          ? object.amount_received
          : 0;
    const sessionId = event.type === "checkout.session.completed" ? asString(object.id) : null;
    const paymentIntentId =
      asString(object.payment_intent) ?? (event.type === "payment_intent.succeeded" ? asString(object.id) : null);
    const result = await recordStripePayment(db, {
      workspaceId,
      quoteId,
      amountCents: amount,
      sessionId,
      paymentIntentId,
      choice: meta.payment_choice ?? null,
    });
    if (!result.changed) safeLog("info", "Stripe Connect: pagamento già registrato", { quoteId });
    return { applied: result.changed, skipped: !result.changed, workspaceId };
  }

  return { applied: false, skipped: true, workspaceId: meta.workspace_id ?? null };
}
