import "server-only";
import { and, eq, inArray, isNotNull, isNull, min } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { catalogItems, clients, quoteEvents, quoteLineItems, quotePaymentEvents, quoteVersions, quotes, templates, user, workspaceMemberships } from "@/db/schema";
import type { AnalyticsInput, ALine, AQuote } from "@/domain/analytics";
import type { CatalogBilling } from "@/domain/catalog";
import type { PriceMode, TaxProfile } from "@/domain/pricing";
import { lineNetCents, type QuoteLine } from "@/domain/quote-document";
import type { QuoteSnapshot } from "@/domain/quote-snapshot";
import { authorize, ok, type Actor, type Result } from "@/server/access";
import { snapshotLines } from "@/server/sent-lines";

/** Accepted quotes sent before quote_line_items was filled: read at most this many snapshots. */
const SNAPSHOT_FALLBACK_LIMIT = 200;

type StoredLine = { quantityMilli: number; unitPriceCents: number; priceMode: string; taxRateBp: number; discountBp: number; billing: string };

function netOf(row: StoredLine, taxProfile: TaxProfile): number {
  const line = {
    id: "x",
    catalogItemId: null,
    name: "x",
    description: "",
    unit: "",
    quantityMilli: row.quantityMilli,
    unitPriceCents: row.unitPriceCents,
    priceMode: row.priceMode as PriceMode,
    taxRateBp: row.taxRateBp,
    taxNature: null,
    discountBp: row.discountBp,
    billing: row.billing as CatalogBilling,
    periods: null,
  } satisfies QuoteLine;
  return lineNetCents(line, taxProfile);
}

/** Everything the analytics page needs for one workspace, in a handful of indexed queries. */
export async function loadAnalyticsInput(db: AppDatabase, actor: Actor, taxProfile: TaxProfile): Promise<Result<AnalyticsInput>> {
  const access = await authorize(db, actor, "quotes.read");
  if (!access.ok) return access;
  const ws = actor.workspaceId;

  const [quoteRows, firstSent, payments, members, clientRows, templateRows, catalogRows] = await Promise.all([
    db
      .select({
        id: quotes.id,
        title: quotes.title,
        number: quotes.number,
        status: quotes.status,
        clientId: quotes.clientId,
        templateId: quotes.templateId,
        ownerId: quotes.ownerId,
        totalCents: quotes.totalCents,
        recurringCents: quotes.recurringCents,
        createdAt: quotes.createdAt,
        sentAt: quotes.sentAt,
        sentVersionId: quotes.sentVersionId,
        firstViewedAt: quotes.firstViewedAt,
        lastViewedAt: quotes.lastViewedAt,
        decidedAt: quotes.decidedAt,
        validUntil: quotes.validUntil,
        viewCount: quotes.viewCount,
      })
      .from(quotes)
      .where(and(eq(quotes.workspaceId, ws), isNull(quotes.deletedAt))),
    db
      .select({ quoteId: quoteEvents.quoteId, at: min(quoteEvents.createdAt) })
      .from(quoteEvents)
      .where(and(eq(quoteEvents.workspaceId, ws), eq(quoteEvents.type, "sent")))
      .groupBy(quoteEvents.quoteId),
    db
      .select({ quoteId: quotePaymentEvents.quoteId, method: quotePaymentEvents.method, kind: quotePaymentEvents.kind, amountCents: quotePaymentEvents.amountCents, createdAt: quotePaymentEvents.createdAt })
      .from(quotePaymentEvents)
      .where(eq(quotePaymentEvents.workspaceId, ws)),
    db
      .select({ id: user.id, name: user.name })
      .from(workspaceMemberships)
      .innerJoin(user, eq(user.id, workspaceMemberships.userId))
      .where(eq(workspaceMemberships.workspaceId, ws)),
    db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.workspaceId, ws)),
    db.select({ id: templates.id, name: templates.name }).from(templates),
    db.select({ id: catalogItems.id, name: catalogItems.name }).from(catalogItems).where(eq(catalogItems.workspaceId, ws)),
  ]);

  const sentMap = new Map(firstSent.map((row) => [row.quoteId, row.at ? new Date(row.at) : null]));
  const list: AQuote[] = quoteRows.map((q) => ({
    id: q.id,
    title: q.title,
    number: q.number,
    status: q.status,
    clientId: q.clientId,
    templateId: q.templateId,
    ownerId: q.ownerId,
    totalCents: q.totalCents,
    recurringCents: q.recurringCents,
    createdAt: q.createdAt,
    firstSentAt: sentMap.get(q.id) ?? q.sentAt ?? null,
    firstViewedAt: q.firstViewedAt,
    lastViewedAt: q.lastViewedAt,
    decidedAt: q.decidedAt,
    validUntil: q.validUntil,
    viewCount: q.viewCount,
  }));

  // Catalog lines of accepted quotes: the copy written at send time, else the sent snapshot.
  const accepted = quoteRows.filter((q) => q.status === "accepted");
  const lines: ALine[] = [];
  if (accepted.length) {
    const stored = await db
      .select({
        quoteId: quoteLineItems.quoteId,
        catalogItemId: quoteLineItems.catalogItemId,
        quantityMilli: quoteLineItems.quantityMilli,
        unitPriceCents: quoteLineItems.unitPriceCents,
        priceMode: quoteLineItems.priceMode,
        taxRateBp: quoteLineItems.taxRateBp,
        discountBp: quoteLineItems.discountBp,
        billing: quoteLineItems.billing,
      })
      .from(quoteLineItems)
      .innerJoin(quotes, and(eq(quotes.workspaceId, quoteLineItems.workspaceId), eq(quotes.id, quoteLineItems.quoteId)))
      .where(and(eq(quoteLineItems.workspaceId, ws), eq(quotes.status, "accepted"), eq(quoteLineItems.optional, false), isNotNull(quoteLineItems.catalogItemId)));
    const covered = new Set<string>();
    for (const row of stored) {
      covered.add(row.quoteId);
      lines.push({ quoteId: row.quoteId, catalogItemId: row.catalogItemId!, netCents: netOf(row, taxProfile) });
    }
    // Quotes with rows but no catalog lines are also covered: mark every quote that has any copy.
    const anyRows = await db
      .selectDistinct({ quoteId: quoteLineItems.quoteId })
      .from(quoteLineItems)
      .where(eq(quoteLineItems.workspaceId, ws));
    for (const row of anyRows) covered.add(row.quoteId);
    const missing = accepted.filter((q) => !covered.has(q.id) && q.sentVersionId).slice(0, SNAPSHOT_FALLBACK_LIMIT);
    if (missing.length) {
      const versions = await db
        .select({ quoteId: quoteVersions.quoteId, json: quoteVersions.snapshotJson })
        .from(quoteVersions)
        .where(and(eq(quoteVersions.workspaceId, ws), inArray(quoteVersions.id, missing.map((q) => q.sentVersionId!))));
      for (const version of versions) {
        try {
          const snapshot = JSON.parse(version.json) as QuoteSnapshot;
          for (const { line, optional } of snapshotLines(snapshot)) {
            if (optional || !line.catalogItemId) continue;
            lines.push({ quoteId: version.quoteId, catalogItemId: line.catalogItemId, netCents: lineNetCents(line, snapshot.fiscal.taxProfile) });
          }
        } catch {
          // A snapshot that does not parse is skipped, never shown as zero.
        }
      }
    }
  }

  return ok({
    quotes: list,
    payments: payments.map((p) => ({ ...p })),
    lines,
    names: {
      clients: new Map(clientRows.map((row) => [row.id, row.name])),
      templates: new Map(templateRows.map((row) => [row.id, row.name])),
      members: new Map(members.map((row) => [row.id, row.name])),
      catalog: new Map(catalogRows.map((row) => [row.id, row.name])),
    },
  });
}
