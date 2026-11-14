import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { quotePublicLinks, quotes } from "@/db/schema";
import { createId } from "@/domain/ids";
import { publicQuoteUrl, resolvePublicBaseUrl } from "@/domain/public-url";
import { asQuoteStatus, type QuoteStatus } from "@/domain/quote-status";
import { generateLinkToken, hashLinkToken, isWellFormedToken, openToken, sealToken, tokenHint } from "@/server/link-token";

/**
 * Low-level service of the public quote links, scoped by workspace. Permission checks live in
 * the server actions that call it (phase 4, PR F2); this layer only guarantees the data rules.
 */

export function publicBaseUrl(): string {
  return resolvePublicBaseUrl(process.env);
}

export type CreatedLink = { id: string; token: string; url: string; hint: string };

export async function createPublicLink(
  db: AppDatabase,
  input: { workspaceId: string; quoteId: string; createdBy: string | null; recipientEmail?: string | null; expiresAt?: Date | null; now?: Date },
): Promise<CreatedLink> {
  const token = generateLinkToken();
  const id = createId();
  await db.insert(quotePublicLinks).values({
    id,
    workspaceId: input.workspaceId,
    quoteId: input.quoteId,
    tokenHash: hashLinkToken(token),
    tokenEnc: sealToken(token),
    tokenHint: tokenHint(token),
    recipientEmail: input.recipientEmail ?? null,
    expiresAt: input.expiresAt ?? null,
    createdBy: input.createdBy,
    createdAt: input.now ?? new Date(),
  });
  return { id, token, url: publicQuoteUrl(publicBaseUrl(), token), hint: tokenHint(token) };
}

export type LinkState = "active" | "expired" | "revoked" | "invalid";

export type ResolvedLink =
  | { state: "invalid" }
  | {
      state: Exclude<LinkState, "invalid">;
      link: typeof quotePublicLinks.$inferSelect;
      quote: { id: string; workspaceId: string; status: QuoteStatus; sentVersionId: string | null; validUntil: Date | null };
    };

/**
 * From a token in a URL to its link and quote. Malformed tokens never reach the database.
 * Unknown tokens and deleted quotes look the same ("invalid"), so a guess reveals nothing.
 * An accepted quote stays "active": the page is read-only, but the client can still open it.
 */
export async function resolvePublicLink(db: AppDatabase, token: unknown, now = new Date()): Promise<ResolvedLink> {
  if (!isWellFormedToken(token)) return { state: "invalid" };
  const rows = await db
    .select({ link: quotePublicLinks, quote: quotes })
    .from(quotePublicLinks)
    .innerJoin(quotes, and(eq(quotes.workspaceId, quotePublicLinks.workspaceId), eq(quotes.id, quotePublicLinks.quoteId)))
    .where(eq(quotePublicLinks.tokenHash, hashLinkToken(token)))
    .limit(1);
  const row = rows[0];
  if (!row || row.quote.deletedAt) return { state: "invalid" };
  const status = asQuoteStatus(row.quote.status);
  const quote = { id: row.quote.id, workspaceId: row.quote.workspaceId, status, sentVersionId: row.quote.sentVersionId, validUntil: row.quote.validUntil };
  if (row.link.revokedAt) return { state: "revoked", link: row.link, quote };
  if (status === "accepted") return { state: "active", link: row.link, quote };
  if (row.link.expiresAt && row.link.expiresAt.getTime() <= now.getTime()) return { state: "expired", link: row.link, quote };
  return { state: "active", link: row.link, quote };
}

/** Full URL of an existing link for "Copia link", or null when it must be regenerated. */
export async function revealPublicLinkUrl(db: AppDatabase, workspaceId: string, linkId: string): Promise<string | null> {
  const rows = await db
    .select({ tokenEnc: quotePublicLinks.tokenEnc, revokedAt: quotePublicLinks.revokedAt })
    .from(quotePublicLinks)
    .where(and(eq(quotePublicLinks.workspaceId, workspaceId), eq(quotePublicLinks.id, linkId)));
  const row = rows[0];
  if (!row || row.revokedAt) return null;
  const token = openToken(row.tokenEnc);
  return token ? publicQuoteUrl(publicBaseUrl(), token) : null;
}

/** Stops a link immediately. Idempotent: revoking twice keeps the first date. */
export async function revokePublicLink(
  db: AppDatabase,
  input: { workspaceId: string; linkId: string; revokedBy: string | null; replacedByLinkId?: string | null; now?: Date },
): Promise<boolean> {
  const updated = await db
    .update(quotePublicLinks)
    .set({ revokedAt: input.now ?? new Date(), revokedBy: input.revokedBy, replacedByLinkId: input.replacedByLinkId ?? null })
    .where(and(eq(quotePublicLinks.workspaceId, input.workspaceId), eq(quotePublicLinks.id, input.linkId), isNull(quotePublicLinks.revokedAt)))
    .returning({ id: quotePublicLinks.id });
  return updated.length > 0;
}

/** New link for the same quote; the old one dies and points to its replacement. */
export async function regeneratePublicLink(
  db: AppDatabase,
  input: { workspaceId: string; linkId: string; userId: string | null; now?: Date },
): Promise<CreatedLink | null> {
  const rows = await db
    .select()
    .from(quotePublicLinks)
    .where(and(eq(quotePublicLinks.workspaceId, input.workspaceId), eq(quotePublicLinks.id, input.linkId)));
  const old = rows[0];
  if (!old) return null;
  const created = await createPublicLink(db, {
    workspaceId: old.workspaceId,
    quoteId: old.quoteId,
    createdBy: input.userId,
    recipientEmail: old.recipientEmail,
    expiresAt: old.expiresAt,
    now: input.now,
  });
  await revokePublicLink(db, { workspaceId: old.workspaceId, linkId: old.id, revokedBy: input.userId, replacedByLinkId: created.id, now: input.now });
  return created;
}
