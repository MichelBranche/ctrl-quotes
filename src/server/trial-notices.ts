import { and, eq, isNull, lte, gt, sql, inArray } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { subscriptions, user, workspaceMemberships, workspaces } from "@/db/schema";
import { TRIAL_REMINDER_DAYS_LEFT, trialDurationMs } from "@/domain/plans";
import { workspaceEntitlement } from "@/domain/entitlement";
import { renderTrialNoticeEmail, trialBillingUrl, type TrialNoticeKind } from "@/server/email/trial";
import { enqueueJob } from "@/server/outbox";
import { OWNER_NOTICE_JOB } from "@/server/notifications";

async function ownersOf(db: AppDatabase, workspaceId: string) {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(workspaceMemberships)
    .innerJoin(user, eq(user.id, workspaceMemberships.userId))
    .where(and(eq(workspaceMemberships.workspaceId, workspaceId), inArray(workspaceMemberships.role, ["owner", "admin"])));
}

async function enqueueForWorkspace(
  db: AppDatabase,
  workspace: { id: string; name: string },
  kind: TrialNoticeKind,
  daysLeft?: number,
  now?: Date,
) {
  const recipients = await ownersOf(db, workspace.id);
  const contentBase = { kind, workspaceName: workspace.name, daysLeft, billingUrl: trialBillingUrl() };
  for (const recipient of recipients) {
    if (!recipient.email) continue;
    const content = renderTrialNoticeEmail({ ...contentBase, ownerName: recipient.name });
    await enqueueJob(db, {
      type: OWNER_NOTICE_JOB,
      workspaceId: workspace.id,
      payload: { to: recipient.email, subject: content.subject, html: content.html, text: content.text },
      now,
    });
  }
}

/**
 * Marks and enqueues at most one reminder and one expiry email per workspace.
 * The sent-at column is written first, only if it is still null, so a later cron run is a no-op.
 */
export async function enqueueDueTrialNotices(db: AppDatabase, now = new Date()): Promise<{ reminders: number; expired: number }> {
  const nowMs = now.getTime();
  const reminderHorizon = new Date(nowMs + trialDurationMs(TRIAL_REMINDER_DAYS_LEFT));

  const reminderCandidates = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      plan: workspaces.plan,
      planOverride: workspaces.planOverride,
      planOverrideUntil: workspaces.planOverrideUntil,
      trialEndsAt: workspaces.trialEndsAt,
    })
    .from(workspaces)
    .where(
      and(
        isNull(workspaces.deletedAt),
        isNull(workspaces.trialReminderSentAt),
        sql`${workspaces.trialEndsAt} is not null`,
        gt(workspaces.trialEndsAt, now),
        lte(workspaces.trialEndsAt, reminderHorizon),
      ),
    )
    .limit(50);

  const expiredCandidates = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      plan: workspaces.plan,
      planOverride: workspaces.planOverride,
      planOverrideUntil: workspaces.planOverrideUntil,
      trialEndsAt: workspaces.trialEndsAt,
    })
    .from(workspaces)
    .where(
      and(
        isNull(workspaces.deletedAt),
        isNull(workspaces.trialExpiredSentAt),
        sql`${workspaces.trialEndsAt} is not null`,
        lte(workspaces.trialEndsAt, now),
      ),
    )
    .limit(50);

  let reminders = 0;
  let expired = 0;

  for (const row of reminderCandidates) {
    const [sub] = await db
      .select({ status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, row.id))
      .limit(1);
    const access = workspaceEntitlement({
      plan: row.plan,
      planOverride: row.planOverride,
      planOverrideUntil: row.planOverrideUntil,
      trialEndsAt: row.trialEndsAt,
      subscriptionStatus: sub?.status ?? null,
    }, now);
    if (!access.trialActive || !access.showReminderBanner) continue;
    const [claimed] = await db
      .update(workspaces)
      .set({ trialReminderSentAt: now, updatedAt: now })
      .where(and(eq(workspaces.id, row.id), isNull(workspaces.trialReminderSentAt)))
      .returning({ id: workspaces.id });
    if (!claimed) continue;
    await enqueueForWorkspace(db, row, "reminder", access.daysLeft, now);
    reminders += 1;
  }

  for (const row of expiredCandidates) {
    const [sub] = await db
      .select({ status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, row.id))
      .limit(1);
    const access = workspaceEntitlement({
      plan: row.plan,
      planOverride: row.planOverride,
      planOverrideUntil: row.planOverrideUntil,
      trialEndsAt: row.trialEndsAt,
      subscriptionStatus: sub?.status ?? null,
    }, now);
    if (!access.trialExpired) continue;
    const [claimed] = await db
      .update(workspaces)
      .set({ trialExpiredSentAt: now, updatedAt: now })
      .where(and(eq(workspaces.id, row.id), isNull(workspaces.trialExpiredSentAt)))
      .returning({ id: workspaces.id });
    if (!claimed) continue;
    await enqueueForWorkspace(db, row, "expired", 0, now);
    expired += 1;
  }

  return { reminders, expired };
}
