import "server-only";
import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { quoteLineItems, quoteVersions } from "@/db/schema";
import { linesOf, type QuoteLine } from "@/domain/quote-document";
import type { QuoteSnapshot } from "@/domain/quote-snapshot";

/** Lines of a stored snapshot, services first, options flagged as optional. */
export function snapshotLines(snapshot: QuoteSnapshot): Array<{ line: QuoteLine; optional: boolean }> {
  return [
    ...linesOf(snapshot.document, "services").map((line) => ({ line, optional: false })),
    ...linesOf(snapshot.document, "options").map((line) => ({ line, optional: true })),
  ];
}

/**
 * Copies the lines of the version just sent into quote_line_items (table already in the schema,
 * so no migration), keeping catalog_item_id for the "best selling items" analytics. The rows always
 * mirror the last sent version: the previous copy for the same quote is replaced. Best effort: a
 * failure here never blocks a send.
 */
export async function recordSentLines(db: AppDatabase, workspaceId: string, quoteId: string, versionId: string): Promise<void> {
  try {
    const [version] = await db
      .select({ json: quoteVersions.snapshotJson })
      .from(quoteVersions)
      .where(and(eq(quoteVersions.workspaceId, workspaceId), eq(quoteVersions.id, versionId)))
      .limit(1);
    if (!version) return;
    const snapshot = JSON.parse(version.json) as QuoteSnapshot;
    const rows = snapshotLines(snapshot).map(({ line, optional }, index) => ({
      id: `${versionId}:${line.id}`.slice(0, 160),
      workspaceId,
      quoteId,
      sectionId: null,
      catalogItemId: line.catalogItemId,
      name: line.name,
      description: line.description || null,
      quantityMilli: line.quantityMilli,
      unitPriceCents: line.unitPriceCents,
      priceMode: line.priceMode,
      taxRateBp: line.taxRateBp,
      discountBp: line.discountBp,
      billing: line.billing,
      optional,
      sortOrder: index,
    }));
    await db.delete(quoteLineItems).where(and(eq(quoteLineItems.workspaceId, workspaceId), eq(quoteLineItems.quoteId, quoteId)));
    if (rows.length) await db.insert(quoteLineItems).values(rows).onConflictDoNothing();
  } catch (error) {
    console.warn("[sent-lines] copia righe non riuscita", { quoteId, error: error instanceof Error ? error.message : String(error) });
  }
}
