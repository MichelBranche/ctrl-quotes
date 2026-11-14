import { and, count, eq, isNotNull, isNull, ne, or, sum } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { brandKits, catalogItems, quotes } from "@/db/schema";
import { authorize, ok, type Actor, type Result } from "@/server/access";

export type OverviewStats = {
  /** Sum of cached quote totals (cents, VAT included), drafts included. */
  totalValueCents: number;
  quoteCount: number;
  sentCount: number;
  acceptedCount: number;
  /** Accepted over sent, 0..100, rounded. Null when nothing was sent yet. */
  acceptanceRate: number | null;
  setup: { brand: boolean; catalog: boolean; firstQuote: boolean };
};

/** Real numbers for the Overview dashboard, scoped to the actor workspace. */
export async function loadOverviewStats(db: AppDatabase, actor: Actor): Promise<Result<OverviewStats>> {
  const access = await authorize(db, actor, "quotes.read");
  if (!access.ok) return access;
  const live = and(eq(quotes.workspaceId, actor.workspaceId), isNull(quotes.deletedAt));
  const [totals, sent, accepted, brand, catalog] = await Promise.all([
    db.select({ value: sum(quotes.totalCents), n: count() }).from(quotes).where(live),
    db
      .select({ n: count() })
      .from(quotes)
      .where(and(live, or(isNotNull(quotes.sentAt), ne(quotes.status, "draft")))),
    db
      .select({ n: count() })
      .from(quotes)
      .where(and(live, eq(quotes.status, "accepted"))),
    db
      .select({ logo: brandKits.logoAssetId, name: brandKits.companyName })
      .from(brandKits)
      .where(eq(brandKits.workspaceId, actor.workspaceId))
      .limit(1),
    db
      .select({ n: count() })
      .from(catalogItems)
      .where(and(eq(catalogItems.workspaceId, actor.workspaceId), isNull(catalogItems.deletedAt))),
  ]);
  const quoteCount = totals[0]?.n ?? 0;
  const sentCount = sent[0]?.n ?? 0;
  const acceptedCount = accepted[0]?.n ?? 0;
  const kit = brand[0];
  return ok({
    totalValueCents: Number(totals[0]?.value ?? 0),
    quoteCount,
    sentCount,
    acceptedCount,
    acceptanceRate: sentCount > 0 ? Math.round((acceptedCount / sentCount) * 100) : null,
    setup: {
      brand: Boolean(kit?.logo || kit?.name?.trim()),
      catalog: (catalog[0]?.n ?? 0) > 0,
      firstQuote: quoteCount > 0,
    },
  });
}
