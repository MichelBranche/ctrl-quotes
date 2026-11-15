import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/db/client";
import { notificationPrefs, notifications, quotes, user } from "@/db/schema";
import { createId } from "@/domain/ids";
import { ownerNoticeTitle, renderOwnerNoticeEmail, type OwnerNoticeType } from "@/server/email/owner-notice";
import { enqueueJob } from "@/server/outbox";
import { safeLog } from "@/server/redact";

export const OWNER_NOTICE_JOB = "quote.owner_notice";

export type ShellNotification = {
  id: string;
  type: OwnerNoticeType;
  title: string;
  href: string | null;
  createdAt: string;
  readAt: string | null;
};

function appBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "https://quotes.ctrlagency.dev";
  return raw.replace(/\/$/, "");
}

export function quoteAppUrl(quoteId: string): string {
  return `${appBaseUrl()}/app/quotes/${quoteId}`;
}

async function ownerOf(db: AppDatabase, workspaceId: string, quoteId: string) {
  const rows = await db
    .select({ ownerId: quotes.ownerId, title: quotes.title, number: quotes.number })
    .from(quotes)
    .where(and(eq(quotes.workspaceId, workspaceId), eq(quotes.id, quoteId)));
  const quote = rows[0];
  if (!quote?.ownerId) return null;
  const owners = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.id, quote.ownerId));
  const owner = owners[0];
  if (!owner) return null;
  return { ...owner, title: quote.title, number: quote.number };
}

async function prefsOf(db: AppDatabase, userId: string, workspaceId: string) {
  const rows = await db
    .select()
    .from(notificationPrefs)
    .where(and(eq(notificationPrefs.userId, userId), eq(notificationPrefs.workspaceId, workspaceId)));
  return rows[0] ?? { emailOnView: "first" as const, emailOnDecision: true };
}

/**
 * In-app notification for the quote owner, plus an email according to their preferences.
 * Never throws towards the public page: a failed notice must not block a view or a decision.
 */
export async function notifyQuoteOwner(
  db: AppDatabase,
  input: {
    workspaceId: string;
    quoteId: string;
    eventId: string;
    type: OwnerNoticeType;
    studioName: string;
    email?: boolean;
  },
): Promise<void> {
  try {
    const owner = await ownerOf(db, input.workspaceId, input.quoteId);
    if (!owner) return;
    const title = ownerNoticeTitle(input.type, owner.number, owner.title);
    await db
      .insert(notifications)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        userId: owner.id,
        quoteId: input.quoteId,
        eventId: input.eventId,
        type: input.type,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    const prefs = await prefsOf(db, owner.id, input.workspaceId);
    const wantEmail =
      input.email !== false &&
      (input.type === "quote_viewed" ? prefs.emailOnView !== "never" : prefs.emailOnDecision);
    if (!wantEmail || !owner.email) return;
    const content = renderOwnerNoticeEmail({
      type: input.type,
      ownerName: owner.name,
      studioName: input.studioName,
      quoteTitle: owner.title,
      quoteNumber: owner.number,
      quoteUrl: quoteAppUrl(input.quoteId),
    });
    await enqueueJob(db, {
      type: OWNER_NOTICE_JOB,
      workspaceId: input.workspaceId,
      payload: { to: owner.email, subject: content.subject, html: content.html, text: content.text },
    });
  } catch (error) {
    safeLog("warn", "[notify] avviso al titolare non inviato", { error: error instanceof Error ? error.message : String(error) });
  }
}

export async function listNotifications(db: AppDatabase, userId: string, workspaceId: string, limit = 8): Promise<ShellNotification[]> {
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      quoteId: notifications.quoteId,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      title: quotes.title,
      number: quotes.number,
    })
    .from(notifications)
    .leftJoin(quotes, and(eq(quotes.workspaceId, notifications.workspaceId), eq(quotes.id, notifications.quoteId)))
    .where(and(eq(notifications.userId, userId), eq(notifications.workspaceId, workspaceId)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map((row) => {
    const known = ["quote_accepted", "quote_rejected", "quote_viewed", "quote_paid", "quote_deposit_paid"] as const;
    const type: OwnerNoticeType = (known as readonly string[]).includes(row.type) ? (row.type as OwnerNoticeType) : "quote_viewed";
    return {
      id: row.id,
      type,
      title: ownerNoticeTitle(type, row.number, row.title ?? "Preventivo"),
      href: row.quoteId ? `/app/quotes/${row.quoteId}` : null,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt ? row.readAt.toISOString() : null,
    };
  });
}

export async function markNotificationsRead(db: AppDatabase, userId: string, workspaceId: string, ids: string[]): Promise<void> {
  const now = new Date();
  for (const id of ids.slice(0, 20)) {
    await db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId), eq(notifications.workspaceId, workspaceId), isNull(notifications.readAt)));
  }
}

const noticePayload = z.object({ to: z.string(), subject: z.string(), html: z.string(), text: z.string() });

export async function deliverOwnerNotice(raw: unknown, driver?: { send: (message: { to: string; subject: string; html: string; text: string }) => Promise<void> }): Promise<void> {
  const payload = noticePayload.parse(raw);
  const { getEmailDriver } = driver ? { getEmailDriver: () => driver } : await import("@/server/email");
  await (driver ?? getEmailDriver()).send({ to: payload.to, subject: payload.subject, html: payload.html, text: payload.text });
}

export function ownerNoticeHandlers(_db: AppDatabase, driver?: { send: (message: { to: string; subject: string; html: string; text: string }) => Promise<void> }) {
  return { [OWNER_NOTICE_JOB]: (payload: unknown) => deliverOwnerNotice(payload, driver) };
}
