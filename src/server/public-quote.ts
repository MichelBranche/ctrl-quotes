import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { assetBlobs, assets, quoteEvents, quotePublicLinks, quotes, quoteVersions } from "@/db/schema";
import { createId } from "@/domain/ids";
import type { QuoteSnapshot } from "@/domain/quote-snapshot";
import { nextQuoteStatus, type QuoteStatus } from "@/domain/quote-status";
import { resolvePublicLink, type ResolvedLink } from "@/server/public-links";
import { createRateLimiter, rateRules } from "@/server/rate-limit";
import { deviceClass } from "@/server/request-meta";

/**
 * Phase 4, PR F3: what the client sees behind /q/[token]. Every read starts from the token and
 * stays inside its workspace. The page only ever shows the last sent version, never the draft.
 */

type Studio = { studioName: string; contactName: string | null; contactEmail: string | null };

export type PublicQuoteView =
  | { kind: "invalid" }
  | { kind: "limited" }
  | ({ kind: "revoked" } & Studio)
  | ({ kind: "expired"; expiredOn: Date | null } & Studio)
  | ({
      kind: "active";
      snapshot: QuoteSnapshot;
      versionNo: number;
      sentAt: Date | null;
      status: QuoteStatus;
      /** Whole days left before the link expires (0 on the last day), null without validity. */
      daysLeft: number | null;
    } & Studio);

type SentVersion = { snapshot: QuoteSnapshot; versionNo: number };

export async function loadSentVersion(db: AppDatabase, workspaceId: string, versionId: string | null): Promise<SentVersion | null> {
  if (!versionId) return null;
  const rows = await db
    .select({ snapshot: quoteVersions.snapshotJson, versionNo: quoteVersions.versionNo })
    .from(quoteVersions)
    .where(and(eq(quoteVersions.workspaceId, workspaceId), eq(quoteVersions.id, versionId)));
  const row = rows[0];
  return row ? { snapshot: JSON.parse(row.snapshot) as QuoteSnapshot, versionNo: row.versionNo } : null;
}

function studioOf(snapshot: QuoteSnapshot): Studio {
  return {
    studioName: snapshot.issuer.displayName,
    contactName: snapshot.issuer.ownerName,
    contactEmail: snapshot.issuer.ownerEmail ?? snapshot.issuer.email,
  };
}

/** Moves an open quote to "Scaduto" the moment someone opens an expired link. */
async function expireIfOpen(db: AppDatabase, quote: { id: string; workspaceId: string; status: QuoteStatus }, now: Date) {
  const to = nextQuoteStatus(quote.status, "expire", "system");
  if (!to) return;
  const updated = await db
    .update(quotes)
    .set({ status: to, updatedAt: now })
    .where(and(eq(quotes.workspaceId, quote.workspaceId), eq(quotes.id, quote.id), eq(quotes.status, quote.status)))
    .returning({ id: quotes.id });
  if (updated.length === 0) return;
  await db.insert(quoteEvents).values({ id: createId(), workspaceId: quote.workspaceId, quoteId: quote.id, type: "expired", actor: "system", meta: "{}", createdAt: now });
}

/** Rate limited by IP: page reads, plus a stricter budget for unknown tokens. */
export async function loadPublicQuote(db: AppDatabase, token: string, ip: string, now = new Date()): Promise<PublicQuoteView> {
  const limiter = createRateLimiter(db);
  if (!(await limiter.hit(rateRules.publicRead, ip, now.getTime())).ok) return { kind: "limited" };
  const resolved = await resolvePublicLink(db, token, now);
  if (resolved.state === "invalid") {
    if (!(await limiter.hit(rateRules.badToken, ip, now.getTime())).ok) return { kind: "limited" };
    return { kind: "invalid" };
  }
  const sent = await loadSentVersion(db, resolved.quote.workspaceId, resolved.quote.sentVersionId);
  if (!sent) return { kind: "invalid" };
  const studio = studioOf(sent.snapshot);
  if (resolved.state === "revoked") return { kind: "revoked", ...studio };
  if (resolved.state === "expired") {
    await expireIfOpen(db, resolved.quote, now);
    return { kind: "expired", expiredOn: resolved.quote.validUntil, ...studio };
  }
  const sentAt = await sentAtOf(db, resolved);
  const expiresAt = resolved.link.expiresAt;
  const daysLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000) - 1) : null;
  return { kind: "active", snapshot: sent.snapshot, versionNo: sent.versionNo, sentAt, status: resolved.quote.status, daysLeft, ...studio };
}

async function sentAtOf(db: AppDatabase, resolved: Exclude<ResolvedLink, { state: "invalid" }>) {
  const rows = await db.select({ sentAt: quotes.sentAt }).from(quotes).where(and(eq(quotes.workspaceId, resolved.quote.workspaceId), eq(quotes.id, resolved.quote.id)));
  return rows[0]?.sentAt ?? null;
}

/** Sent version for the PDF and image routes: only for links the client may still open. */
export async function openSentVersion(db: AppDatabase, token: string, ip: string, now = new Date()) {
  const limiter = createRateLimiter(db);
  if (!(await limiter.hit(rateRules.publicRead, ip, now.getTime())).ok) return { limited: true as const };
  const resolved = await resolvePublicLink(db, token, now);
  if (resolved.state !== "active") {
    if (resolved.state === "invalid") await limiter.hit(rateRules.badToken, ip, now.getTime());
    return null;
  }
  const sent = await loadSentVersion(db, resolved.quote.workspaceId, resolved.quote.sentVersionId);
  return sent ? { ...sent, workspaceId: resolved.quote.workspaceId } : null;
}

/** An uploaded image of the sent version. Assets not used by that version are never served. */
export async function readSnapshotAsset(db: AppDatabase, workspaceId: string, snapshot: QuoteSnapshot, assetId: string) {
  if (!snapshot.images.some((image) => image.id === assetId)) return null;
  const rows = await db
    .select({ mime: assets.mime, data: assetBlobs.data })
    .from(assets)
    .innerJoin(assetBlobs, and(eq(assetBlobs.workspaceId, assets.workspaceId), eq(assetBlobs.assetId, assets.id)))
    .where(and(eq(assets.workspaceId, workspaceId), eq(assets.id, assetId)));
  return rows[0] ? { mime: rows[0].mime, data: Buffer.from(rows[0].data) } : null;
}

/**
 * A real open: the page calls this after 2 seconds of visibility, so mail scanners that only
 * fetch the HTML do not count. Counters on the link and the quote; one "viewed" event, the first.
 * No IP is stored, only the device class.
 */
export async function recordView(
  db: AppDatabase,
  token: string,
  meta: { userAgent: string | null; skipWorkspaceIds?: string[] },
  now = new Date(),
): Promise<{ recorded: boolean; first: boolean }> {
  const resolved = await resolvePublicLink(db, token, now);
  if (resolved.state !== "active") return { recorded: false, first: false };
  // The studio opening its own link is not a client view.
  if (meta.skipWorkspaceIds?.includes(resolved.quote.workspaceId)) return { recorded: false, first: false };
  const { workspaceId, id: quoteId } = resolved.quote;
  await db
    .update(quotePublicLinks)
    .set({ firstViewedAt: sql`coalesce(${quotePublicLinks.firstViewedAt}, ${now.getTime()})`, lastViewedAt: now, viewCount: sql`${quotePublicLinks.viewCount} + 1` })
    .where(and(eq(quotePublicLinks.workspaceId, workspaceId), eq(quotePublicLinks.id, resolved.link.id)));
  const first = await db
    .update(quotes)
    .set({ firstViewedAt: now })
    .where(and(eq(quotes.workspaceId, workspaceId), eq(quotes.id, quoteId), sql`${quotes.firstViewedAt} is null`))
    .returning({ id: quotes.id });
  await db
    .update(quotes)
    .set({ lastViewedAt: now, viewCount: sql`${quotes.viewCount} + 1` })
    .where(and(eq(quotes.workspaceId, workspaceId), eq(quotes.id, quoteId)));
  if (first.length > 0) {
    await db.insert(quoteEvents).values({
      id: createId(),
      workspaceId,
      quoteId,
      type: "viewed",
      actor: "recipient",
      versionId: resolved.quote.sentVersionId,
      meta: JSON.stringify({ device: deviceClass(meta.userAgent), linkId: resolved.link.id }),
      createdAt: now,
    });
  }
  return { recorded: true, first: first.length > 0 };
}
