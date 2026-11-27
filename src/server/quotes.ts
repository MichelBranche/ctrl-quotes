import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNull, max, or, sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import type { AcceptanceOverlay } from "@/components/quote-render/model";
import { loadQuoteAcceptance, toAcceptanceOverlay } from "@/server/acceptance";
import {
  assetBlobs,
  assets,
  catalogItems,
  catalogPackageItems,
  clientContacts,
  clients,
  quoteDrafts,
  quoteEvents,
  quoteNumberSequences,
  quotes,
  quoteVersions,
  templates,
  user,
} from "@/db/schema";
import type { CatalogBilling, CatalogType } from "@/domain/catalog";
import { firstIssue, likePattern, type ClientKind } from "@/domain/clients";
import { createId } from "@/domain/ids";
import { formatQuoteNumber } from "@/domain/numbering";
import { can } from "@/domain/permissions";
import type { PriceMode, TaxProfile } from "@/domain/pricing";
import {
  computeTotals,
  createQuoteSchema,
  draftInputSchema,
  initialDocument,
  lineFromCatalog,
  parseDocument,
  referencedAssets,
  type QuoteDocument,
  type QuoteLine,
  type QuoteTotals,
} from "@/domain/quote-document";
import {
  asTemplateKey,
  canonicalJson,
  RENDERER_VERSION,
  templateIdFor,
  type QuoteSnapshot,
  type TemplateKey,
} from "@/domain/quote-snapshot";
import { lockedChange, lockedChangeMessage } from "@/domain/locks";
import { asQuoteStatus, isEditable, type QuoteFilter, type QuoteStatus } from "@/domain/quote-status";
import { authorize, conflict, invalid, notFound, ok, type Actor, type Failure, type Result } from "@/server/access";
import { writeAuditLog } from "@/server/audit";
import { getWorkspaceConfig, type WorkspaceConfig } from "@/server/settings";

export type QuoteRow = {
  id: string;
  number: string | null;
  title: string;
  status: QuoteStatus;
  clientId: string | null;
  clientName: string | null;
  totalCents: number;
  recurringCents: number;
  validUntil: Date | null;
  updatedAt: Date;
  createdAt: Date;
  versionCount: number;
};

export type QuoteList = {
  items: QuoteRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<QuoteFilter, number>;
  workspaceTotal: number;
};

export type QuoteVersionRow = {
  id: string;
  versionNo: number;
  createdAt: Date;
  authorName: string | null;
  sha256: string;
  totalCents: number;
};

export type QuotableItem = {
  id: string;
  type: CatalogType;
  name: string;
  description: string | null;
  unit: string | null;
  unitPriceCents: number;
  priceMode: PriceMode;
  taxRateBp: number;
  taxNature: string | null;
  billing: CatalogBilling;
  periods: number | null;
};

export type QuoteEditorData = {
  quote: {
    id: string;
    number: string | null;
    title: string;
    status: QuoteStatus;
    clientId: string | null;
    templateKey: TemplateKey;
    validUntil: string | null;
    ownerId: string | null;
    createdAt: Date;
    updatedAt: Date;
    /** Phase 4: the version the client currently sees, null before the first send. */
    sentVersionId: string | null;
    sentAt: Date | null;
  };
  revision: number;
  draftUpdatedAt: Date;
  document: QuoteDocument;
  documentRecovered: boolean;
  totals: QuoteTotals;
  versions: QuoteVersionRow[];
  snapshot: QuoteSnapshot;
  canDelete: boolean;
  canEdit: boolean;
  canSend: boolean;
  acceptance: (AcceptanceOverlay & { decidedAt: string }) | null;
};

const PAGE_MAX = 50;

function asBilling(value: string): CatalogBilling {
  return value === "mensile" ? "mensile" : value === "annuale" ? "annuale" : "una_tantum";
}

function asType(value: string): CatalogType {
  return value === "prodotto" ? "prodotto" : value === "pacchetto" ? "pacchetto" : "servizio";
}

function asKind(value: string): ClientKind {
  return value === "privato" ? "privato" : "azienda";
}

/** Calendar date in Europe/Rome, as YYYY-MM-DD. */
export function romeDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Date-only values are stored at noon UTC so every European time zone reads the same calendar day. */
function dateFromIso(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function romeYear(date: Date): number {
  return Number(romeDate(date).slice(0, 4));
}

/**
 * Reserves the next number for the workspace with a single atomic upsert.
 * With reset "never" the counter lives under year 0 and keeps growing.
 */
export async function reserveQuoteNumber(
  db: AppDatabase,
  workspaceId: string,
  format: string,
  reset: "yearly" | "never",
  now = new Date(),
): Promise<string> {
  const year = romeYear(now);
  const bucket = reset === "never" ? 0 : year;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const rows = await db
      .insert(quoteNumberSequences)
      .values({ workspaceId, year: bucket, lastValue: 1 })
      .onConflictDoUpdate({
        target: [quoteNumberSequences.workspaceId, quoteNumberSequences.year],
        set: { lastValue: sql`${quoteNumberSequences.lastValue} + 1` },
      })
      .returning({ value: quoteNumberSequences.lastValue });
    const value = rows[0]?.value;
    if (!value) throw new Error("Numerazione non disponibile.");
    const number = formatQuoteNumber(format, year, value);
    // A format change can collide with numbers issued earlier: skip ahead instead of failing.
    const taken = await db
      .select({ id: quotes.id })
      .from(quotes)
      .where(and(eq(quotes.workspaceId, workspaceId), eq(quotes.number, number)));
    if (taken.length === 0) return number;
  }
  throw new Error("Impossibile assegnare un numero libero. Controlla il formato della numerazione.");
}

async function event(
  db: AppDatabase,
  actor: Actor,
  quoteId: string,
  type: string,
  meta?: Record<string, string | number | null>,
  versionId?: string,
) {
  await db.insert(quoteEvents).values({
    id: createId(),
    workspaceId: actor.workspaceId,
    quoteId,
    type,
    actor: "user",
    actorUserId: actor.userId,
    versionId: versionId ?? null,
    meta: meta ? JSON.stringify(meta) : null,
    createdAt: new Date(),
  });
}

async function audit(db: AppDatabase, actor: Actor, action: string, quoteId: string, meta?: Record<string, string | number | null>) {
  await writeAuditLog(db, { workspaceId: actor.workspaceId, actorUserId: actor.userId, action, entityType: "quote", entityId: quoteId, meta });
}

async function findClientRow(db: AppDatabase, workspaceId: string, clientId: string) {
  const rows = await db
    .select()
    .from(clients)
    .where(and(eq(clients.workspaceId, workspaceId), eq(clients.id, clientId), isNull(clients.deletedAt)));
  return rows[0] ?? null;
}

async function templateExists(db: AppDatabase, templateId: string): Promise<boolean> {
  const rows = await db.select({ id: templates.id }).from(templates).where(eq(templates.id, templateId));
  return rows.length > 0;
}

const itemColumns = {
  id: catalogItems.id,
  type: catalogItems.type,
  name: catalogItems.name,
  description: catalogItems.description,
  unit: catalogItems.unit,
  unitPriceCents: catalogItems.unitPriceCents,
  priceMode: catalogItems.priceMode,
  taxRateBp: catalogItems.taxRateBp,
  taxNature: catalogItems.taxNature,
  billing: catalogItems.billing,
  periods: catalogItems.periods,
};

type RawItem = {
  id: string;
  type: string;
  name: string;
  description: string | null;
  unit: string | null;
  unitPriceCents: number;
  priceMode: string;
  taxRateBp: number;
  taxNature: string | null;
  billing: string;
  periods: number | null;
};

function asItem(row: RawItem): QuotableItem {
  return {
    id: row.id,
    type: asType(row.type),
    name: row.name,
    description: row.description,
    unit: row.unit,
    unitPriceCents: row.unitPriceCents,
    priceMode: row.priceMode === "gross" ? "gross" : "net",
    taxRateBp: row.taxRateBp,
    taxNature: row.taxNature,
    billing: asBilling(row.billing),
    periods: row.periods,
  };
}

/** Catalog entries that can be copied into a quote. */
export async function listQuotableItems(db: AppDatabase, actor: Actor): Promise<Result<QuotableItem[]>> {
  const access = await authorize(db, actor, "catalog.read");
  if (!access.ok) return access;
  const rows = await db
    .select(itemColumns)
    .from(catalogItems)
    .where(and(eq(catalogItems.workspaceId, actor.workspaceId), isNull(catalogItems.deletedAt)))
    .orderBy(asc(sql`lower(${catalogItems.name})`))
    .limit(500);
  return ok(rows.map(asItem));
}

/** Builds quote lines from catalog ids, keeping the requested order. Packages carry their composition in the description. */
export async function linesFromCatalog(db: AppDatabase, workspaceId: string, ids: string[]): Promise<Result<QuoteLine[]>> {
  if (ids.length === 0) return ok([]);
  const unique = [...new Set(ids)];
  const rows = await db
    .select(itemColumns)
    .from(catalogItems)
    .where(and(eq(catalogItems.workspaceId, workspaceId), inArray(catalogItems.id, unique), isNull(catalogItems.deletedAt)));
  if (rows.length !== unique.length) return invalid("Una delle voci scelte non esiste più nel catalogo.");
  const byId = new Map(rows.map((row) => [row.id, asItem(row)]));
  const packageIds = rows.filter((row) => row.type === "pacchetto").map((row) => row.id);
  const components = packageIds.length
    ? await db
        .select({ packageId: catalogPackageItems.packageId, name: catalogItems.name, quantityMilli: catalogPackageItems.quantityMilli })
        .from(catalogPackageItems)
        .innerJoin(catalogItems, and(eq(catalogItems.workspaceId, catalogPackageItems.workspaceId), eq(catalogItems.id, catalogPackageItems.itemId)))
        .where(and(eq(catalogPackageItems.workspaceId, workspaceId), inArray(catalogPackageItems.packageId, packageIds)))
        .orderBy(asc(catalogItems.name))
    : [];
  return ok(
    ids.flatMap((id) => {
      const item = byId.get(id);
      if (!item) return [];
      const line = lineFromCatalog(item);
      if (item.type === "pacchetto") {
        const parts = components.filter((component) => component.packageId === id);
        if (parts.length) {
          const list = parts
            .map((part) => (part.quantityMilli === 1000 ? part.name : `${part.name} x${part.quantityMilli / 1000}`))
            .join(", ");
          line.description = [item.description, `Include: ${list}.`].filter(Boolean).join("\n");
        }
      }
      return [line];
    }),
  );
}

export async function createQuote(db: AppDatabase, actor: Actor, raw: unknown): Promise<Result<{ id: string; number: string }>> {
  const access = await authorize(db, actor, "quotes.write");
  if (!access.ok) return access;
  const parsed = createQuoteSchema.safeParse(raw);
  if (!parsed.success) return invalid(firstIssue(parsed.error));
  const input = parsed.data;
  const config = await getWorkspaceConfig(db, actor);
  if (!config.ok) return config;
  const client = await findClientRow(db, actor.workspaceId, input.clientId);
  if (!client) return notFound("Cliente non trovato in questo workspace.");
  if (client.status === "archived") return invalid("Il cliente è archiviato. Ripristinalo prima di preparare un preventivo.");
  const templateId = input.templateId ?? config.value.settings.defaultTemplateId ?? templateIdFor("minimal");
  if (!(await templateExists(db, templateId))) return notFound("Template non trovato.");
  const lines = await linesFromCatalog(db, actor.workspaceId, input.catalogItemIds);
  if (!lines.ok) return lines;

  const now = new Date();
  const document = initialDocument({
    title: input.title,
    clientName: client.name,
    intro: input.intro,
    lines: lines.value,
    terms: config.value.brand.defaultTerms,
  });
  const totals = computeTotals(document, fiscalOf(config.value));
  const number = await reserveQuoteNumber(
    db,
    actor.workspaceId,
    config.value.brand.quoteNumberFormat,
    config.value.settings.numberReset,
    now,
  );
  const id = createId();
  const validityDays = input.validityDays ?? config.value.settings.defaultValidityDays;
  await db.insert(quotes).values({
    id,
    workspaceId: actor.workspaceId,
    clientId: client.id,
    number,
    title: input.title,
    status: "draft",
    validUntil: dateFromIso(romeDate(addDays(now, validityDays))),
    ownerId: actor.userId,
    templateId,
    totalCents: totals.main.oneTime.totalCents,
    recurringCents: totals.main.monthly.totalCents + totals.main.yearly.totalCents,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(quoteDrafts).values({
    workspaceId: actor.workspaceId,
    quoteId: id,
    revision: 1,
    blocksJson: JSON.stringify(document),
    updatedAt: now,
  });
  await event(db, actor, id, "created", { number });
  await audit(db, actor, "quote.created", id, { number });
  return ok({ id, number });
}

function fiscalOf(config: WorkspaceConfig): { taxProfile: TaxProfile; stampDutyNote: boolean } {
  return { taxProfile: config.workspace.taxProfile, stampDutyNote: config.settings.stampDutyNote };
}

export type QuoteListQuery = { q?: string; filter?: QuoteFilter; page?: number; pageSize?: number; clientId?: string };

const listColumns = {
  id: quotes.id,
  number: quotes.number,
  title: quotes.title,
  status: quotes.status,
  clientId: quotes.clientId,
  clientName: clients.name,
  totalCents: quotes.totalCents,
  recurringCents: quotes.recurringCents,
  validUntil: quotes.validUntil,
  updatedAt: quotes.updatedAt,
  createdAt: quotes.createdAt,
  versionCount: sql<number>`(select count(*) from ${quoteVersions} where ${quoteVersions.workspaceId} = ${quotes.workspaceId} and ${quoteVersions.quoteId} = ${quotes.id})`,
};

function joinClient() {
  return and(eq(clients.workspaceId, quotes.workspaceId), eq(clients.id, quotes.clientId));
}

function searchCondition(q: string | undefined): SQL | undefined {
  const query = q?.trim();
  if (!query) return undefined;
  const pattern = likePattern(query);
  return or(
    sql`${quotes.title} like ${pattern} escape '\\'`,
    sql`coalesce(${quotes.number}, '') like ${pattern} escape '\\'`,
    sql`coalesce(${clients.name}, '') like ${pattern} escape '\\'`,
  );
}

function toRow(row: Omit<QuoteRow, "status" | "versionCount"> & { status: string; versionCount: number | string }): QuoteRow {
  return { ...row, status: asQuoteStatus(row.status), versionCount: Number(row.versionCount) };
}

export async function listQuotes(db: AppDatabase, actor: Actor, query: QuoteListQuery = {}): Promise<Result<QuoteList>> {
  const access = await authorize(db, actor, "quotes.read");
  if (!access.ok) return access;
  const filter = query.filter ?? "all";
  const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), PAGE_MAX);
  const page = Math.max(query.page ?? 1, 1);
  const base = [eq(quotes.workspaceId, actor.workspaceId), isNull(quotes.deletedAt)];
  const search = searchCondition(query.q);
  const status = filter === "all" ? undefined : eq(quotes.status, filter);
  const where = and(...base, search, status);
  const [items, totalRows, countRows, workspaceRows] = await Promise.all([
    db
      .select(listColumns)
      .from(quotes)
      .leftJoin(clients, joinClient())
      .where(where)
      .orderBy(desc(quotes.updatedAt), desc(quotes.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(quotes).leftJoin(clients, joinClient()).where(where),
    db
      .select({ status: quotes.status, value: count() })
      .from(quotes)
      .leftJoin(clients, joinClient())
      .where(and(...base, search))
      .groupBy(quotes.status),
    db.select({ value: count() }).from(quotes).where(and(...base)),
  ]);
  const counts: Record<QuoteFilter, number> = { all: 0, draft: 0, pending: 0, accepted: 0, rejected: 0, expired: 0 };
  for (const row of countRows) {
    counts.all += row.value;
    if (row.status in counts && row.status !== "all") counts[row.status as Exclude<QuoteFilter, "all">] += row.value;
  }
  return ok({
    items: items.map(toRow),
    total: totalRows[0]?.value ?? 0,
    page,
    pageSize,
    counts,
    workspaceTotal: workspaceRows[0]?.value ?? 0,
  });
}

/** Quote history shown in the client page. */
export async function listClientQuotes(db: AppDatabase, actor: Actor, clientId: string): Promise<Result<QuoteRow[]>> {
  const access = await authorize(db, actor, "quotes.read");
  if (!access.ok) return access;
  const rows = await db
    .select(listColumns)
    .from(quotes)
    .leftJoin(clients, joinClient())
    .where(and(eq(quotes.workspaceId, actor.workspaceId), eq(quotes.clientId, clientId), isNull(quotes.deletedAt)))
    .orderBy(desc(quotes.updatedAt))
    .limit(50);
  return ok(rows.map(toRow));
}

export async function findQuote(db: AppDatabase, workspaceId: string, quoteId: string) {
  const rows = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.workspaceId, workspaceId), eq(quotes.id, quoteId), isNull(quotes.deletedAt)));
  return rows[0] ?? null;
}

export async function findDraft(db: AppDatabase, workspaceId: string, quoteId: string) {
  const rows = await db
    .select()
    .from(quoteDrafts)
    .where(and(eq(quoteDrafts.workspaceId, workspaceId), eq(quoteDrafts.quoteId, quoteId)));
  return rows[0] ?? null;
}

async function listVersions(db: AppDatabase, workspaceId: string, quoteId: string): Promise<QuoteVersionRow[]> {
  const rows = await db
    .select({
      id: quoteVersions.id,
      versionNo: quoteVersions.versionNo,
      createdAt: quoteVersions.createdAt,
      authorName: user.name,
      sha256: quoteVersions.snapshotSha256,
      totalsJson: quoteVersions.totalsJson,
    })
    .from(quoteVersions)
    .leftJoin(user, eq(user.id, quoteVersions.publishedBy))
    .where(and(eq(quoteVersions.workspaceId, workspaceId), eq(quoteVersions.quoteId, quoteId)))
    .orderBy(desc(quoteVersions.versionNo));
  return rows.map(({ totalsJson, ...row }) => {
    let totalCents = 0;
    try {
      totalCents = (JSON.parse(totalsJson) as QuoteTotals).main.oneTime.totalCents;
    } catch {
      totalCents = 0;
    }
    return { ...row, totalCents };
  });
}

type QuoteRecord = NonNullable<Awaited<ReturnType<typeof findQuote>>>;

/**
 * Snapshot of a quote from current data. Versions persist it; drafts render it directly.
 * The logo travels inside the snapshot so later Brand Kit changes leave versions untouched.
 */
export async function buildSnapshot(
  db: AppDatabase,
  actor: Actor,
  config: WorkspaceConfig,
  quote: QuoteRecord,
  document: QuoteDocument,
  options: { embedLogo: boolean },
): Promise<QuoteSnapshot> {
  const workspaceId = actor.workspaceId;
  const [clientRow, contactRows, ownerRows, imageRows, logoRows] = await Promise.all([
    quote.clientId ? findClientRow(db, workspaceId, quote.clientId) : Promise.resolve(null),
    quote.clientId
      ? db
          .select({ name: clientContacts.name, email: clientContacts.email })
          .from(clientContacts)
          .where(and(eq(clientContacts.workspaceId, workspaceId), eq(clientContacts.clientId, quote.clientId)))
          .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.createdAt))
          .limit(1)
      : Promise.resolve([]),
    quote.ownerId ? db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, quote.ownerId)) : Promise.resolve([]),
    referencedAssets(document).length
      ? db
          .select({ id: assets.id, sha256: assets.sha256 })
          .from(assets)
          .where(and(eq(assets.workspaceId, workspaceId), inArray(assets.id, referencedAssets(document))))
      : Promise.resolve([]),
    options.embedLogo && config.brand.logo
      ? db
          .select({ data: assetBlobs.data, mime: assets.mime })
          .from(assets)
          .innerJoin(assetBlobs, and(eq(assetBlobs.workspaceId, assets.workspaceId), eq(assetBlobs.assetId, assets.id)))
          .where(and(eq(assets.workspaceId, workspaceId), eq(assets.id, config.brand.logo.assetId)))
      : Promise.resolve([]),
  ]);
  const brand = config.brand;
  const contact = contactRows[0];
  const owner = ownerRows[0];
  const logo = logoRows[0];
  return {
    rendererVersion: RENDERER_VERSION,
    quote: {
      id: quote.id,
      number: quote.number,
      title: quote.title,
      issuedAt: new Date().toISOString(),
      validUntil: quote.validUntil ? quote.validUntil.toISOString() : null,
    },
    client: clientRow
      ? {
          name: clientRow.name,
          kind: asKind(clientRow.kind),
          vatNumber: clientRow.vatNumber,
          taxCode: clientRow.taxCode,
          address: clientRow.address,
          email: contact?.email ?? clientRow.email,
          contactName: contact?.name ?? null,
        }
      : null,
    issuer: {
      displayName: brand.companyName ?? config.workspace.name,
      companyName: brand.companyName,
      vatNumber: brand.vatNumber,
      taxCode: brand.taxCode,
      address: brand.address,
      email: brand.email,
      phone: brand.phone,
      website: brand.website,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
    },
    brand: {
      colorPrimary: brand.colorPrimary,
      colorSecondary: brand.colorSecondary,
      colorBackground: brand.colorBackground,
      fontHeading: brand.fontHeading,
      fontBody: brand.fontBody,
      logo: logo ? { mime: logo.mime, dataBase64: Buffer.from(logo.data).toString("base64") } : null,
    },
    template: await templateKeyOf(db, quote.templateId ?? config.settings.defaultTemplateId),
    fiscal: fiscalOf(config),
    document,
    totals: computeTotals(document, fiscalOf(config)),
    images: imageRows,
  };
}

async function templateKeyOf(db: AppDatabase, templateId: string | null): Promise<TemplateKey> {
  if (!templateId) return "minimal";
  const rows = await db.select({ key: templates.key }).from(templates).where(eq(templates.id, templateId));
  return asTemplateKey(rows[0]?.key);
}

export async function getQuoteEditor(db: AppDatabase, actor: Actor, quoteId: string): Promise<Result<QuoteEditorData>> {
  const access = await authorize(db, actor, "quotes.read");
  if (!access.ok) return access;
  const quote = await findQuote(db, actor.workspaceId, quoteId);
  if (!quote) return notFound("Preventivo non trovato.");
  const [config, draft, versions] = await Promise.all([
    getWorkspaceConfig(db, actor),
    findDraft(db, actor.workspaceId, quoteId),
    listVersions(db, actor.workspaceId, quoteId),
  ]);
  if (!config.ok) return config;
  const parsed = draft ? parseDocument(draft.blocksJson) : null;
  const document =
    parsed ??
    initialDocument({ title: quote.title, clientName: "", intro: "", lines: [], terms: config.value.brand.defaultTerms });
  const snapshot = await buildSnapshot(db, actor, config.value, quote, document, { embedLogo: false });
  const status = asQuoteStatus(quote.status);
  const role = access.value.role;
  return ok({
    quote: {
      id: quote.id,
      number: quote.number,
      title: quote.title,
      status,
      clientId: quote.clientId,
      templateKey: snapshot.template,
      validUntil: quote.validUntil ? romeDate(quote.validUntil) : null,
      ownerId: quote.ownerId,
      createdAt: quote.createdAt,
      updatedAt: quote.updatedAt,
      sentVersionId: quote.sentVersionId,
      sentAt: quote.sentAt,
    },
    revision: draft?.revision ?? 1,
    draftUpdatedAt: draft?.updatedAt ?? quote.updatedAt,
    document,
    documentRecovered: Boolean(draft) && !parsed,
    totals: snapshot.totals,
    versions,
    snapshot,
    canEdit: can(role, "quotes.write") && isEditable(status),
    canSend: can(role, "quotes.send") && status !== "accepted",
    canDelete: can(role, "quotes.delete") || (quote.ownerId === actor.userId && status === "draft" && versions.length === 0),
    acceptance: await (async () => {
      if (status !== "accepted") return null;
      const view = await loadQuoteAcceptance(db, actor.workspaceId, quoteId);
      const overlay = toAcceptanceOverlay(view, false);
      return overlay && view ? { ...overlay, decidedAt: view.decidedAt.toISOString() } : null;
    })(),
  });
}

async function checkAssets(db: AppDatabase, workspaceId: string, document: QuoteDocument): Promise<Failure | null> {
  const ids = referencedAssets(document);
  if (ids.length === 0) return null;
  const rows = await db
    .select({ id: assets.id, mime: assets.mime })
    .from(assets)
    .where(and(eq(assets.workspaceId, workspaceId), inArray(assets.id, ids)));
  if (rows.length !== ids.length) return invalid("Un'immagine del preventivo non è più disponibile. Caricala di nuovo.");
  return null;
}

export type SaveDraftResult = { revision: number; savedAt: Date; totals: QuoteTotals };

/**
 * Autosave with optimistic concurrency: the write only lands when the client sends the revision it started from.
 * Totals are recomputed here; the browser never decides an amount.
 */
export async function saveDraft(db: AppDatabase, actor: Actor, quoteId: string, raw: unknown): Promise<Result<SaveDraftResult>> {
  const access = await authorize(db, actor, "quotes.write");
  if (!access.ok) return access;
  const parsed = draftInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(firstIssue(parsed.error));
  const input = parsed.data;
  const quote = await findQuote(db, actor.workspaceId, quoteId);
  if (!quote) return notFound("Preventivo non trovato.");
  if (!isEditable(asQuoteStatus(quote.status))) return conflict("Questo preventivo è stato accettato e non si può più modificare. Duplicalo per una nuova proposta.");
  if (input.clientId && input.clientId !== quote.clientId) {
    const client = await findClientRow(db, actor.workspaceId, input.clientId);
    if (!client) return notFound("Cliente non trovato in questo workspace.");
  }
  if (!(await templateExists(db, input.templateId))) return notFound("Template non trovato.");
  const assetIssue = await checkAssets(db, actor.workspaceId, input.document);
  if (assetIssue) return assetIssue;
  // Locked blocks keep their content, whatever the client sends. The revision check below makes
  // sure the draft compared here is the one this save replaces.
  const stored = await findDraft(db, actor.workspaceId, quoteId);
  const storedDocument = stored && stored.revision === input.revision ? parseDocument(stored.blocksJson) : null;
  const locked = storedDocument ? lockedChange(storedDocument, input.document) : null;
  if (locked) return invalid(lockedChangeMessage(locked));
  const config = await getWorkspaceConfig(db, actor);
  if (!config.ok) return config;
  const totals = computeTotals(input.document, fiscalOf(config.value));
  const now = new Date();
  const updated = await db
    .update(quoteDrafts)
    .set({ blocksJson: JSON.stringify(input.document), revision: input.revision + 1, updatedAt: now })
    .where(
      and(
        eq(quoteDrafts.workspaceId, actor.workspaceId),
        eq(quoteDrafts.quoteId, quoteId),
        eq(quoteDrafts.revision, input.revision),
      ),
    )
    .returning({ revision: quoteDrafts.revision });
  if (updated.length === 0) {
    return conflict("Il preventivo è stato modificato da un'altra scheda o da un collega. Ricarica la pagina per vedere l'ultima versione.");
  }
  await db
    .update(quotes)
    .set({
      title: input.title,
      clientId: input.clientId,
      templateId: input.templateId,
      validUntil: input.validUntil ? dateFromIso(input.validUntil) : null,
      totalCents: totals.main.oneTime.totalCents,
      recurringCents: totals.main.monthly.totalCents + totals.main.yearly.totalCents,
      updatedAt: now,
    })
    .where(and(eq(quotes.workspaceId, actor.workspaceId), eq(quotes.id, quoteId)));
  return ok({ revision: updated[0]?.revision ?? input.revision + 1, savedAt: now, totals });
}

/**
 * Freezes the saved draft into an immutable, numbered version with its hash.
 * The client passes the revision it has on screen so the version matches what the user saw.
 */
export async function createVersion(
  db: AppDatabase,
  actor: Actor,
  quoteId: string,
  revision: number,
): Promise<Result<{ id: string; versionNo: number; sha256: string }>> {
  const access = await authorize(db, actor, "quotes.write");
  if (!access.ok) return access;
  const quote = await findQuote(db, actor.workspaceId, quoteId);
  if (!quote) return notFound("Preventivo non trovato.");
  const draft = await findDraft(db, actor.workspaceId, quoteId);
  if (!draft) return notFound("Bozza non trovata.");
  if (draft.revision !== revision) return conflict("Ci sono modifiche non ancora salvate o arrivate da un'altra scheda. Attendi il salvataggio e riprova.");
  const document = parseDocument(draft.blocksJson);
  if (!document) return invalid("La bozza contiene dati non validi. Correggila prima di creare una versione.");
  if (!quote.clientId) return invalid("Scegli un cliente prima di creare una versione.");
  const config = await getWorkspaceConfig(db, actor);
  if (!config.ok) return config;
  const snapshot = await buildSnapshot(db, actor, config.value, quote, document, { embedLogo: true });
  const json = canonicalJson(snapshot);
  const sha256 = createHash("sha256").update(json).digest("hex");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const latest = await db
      .select({ value: max(quoteVersions.versionNo) })
      .from(quoteVersions)
      .where(and(eq(quoteVersions.workspaceId, actor.workspaceId), eq(quoteVersions.quoteId, quoteId)));
    const versionNo = (latest[0]?.value ?? 0) + 1;
    const id = createId();
    try {
      await db.insert(quoteVersions).values({
        id,
        workspaceId: actor.workspaceId,
        quoteId,
        versionNo,
        snapshotJson: json,
        snapshotSha256: sha256,
        rendererVersion: RENDERER_VERSION,
        totalsJson: JSON.stringify(snapshot.totals),
        publishedBy: actor.userId,
        createdAt: new Date(),
      });
    } catch (error) {
      if (attempt < 2 && String(error).includes("UNIQUE")) continue;
      throw error;
    }
    await db
      .update(quotes)
      .set({ currentVersionId: id, updatedAt: new Date() })
      .where(and(eq(quotes.workspaceId, actor.workspaceId), eq(quotes.id, quoteId)));
    await event(db, actor, quoteId, "version_created", { versionNo, sha256 }, id);
    await audit(db, actor, "quote.version_created", quoteId, { versionNo });
    return ok({ id, versionNo, sha256 });
  }
  return conflict("Un'altra versione è stata creata nello stesso momento. Riprova.");
}

export async function getVersionSnapshot(
  db: AppDatabase,
  actor: Actor,
  quoteId: string,
  versionNo: number,
): Promise<Result<{ snapshot: QuoteSnapshot; versionNo: number; sha256: string; createdAt: Date }>> {
  const access = await authorize(db, actor, "quotes.read");
  if (!access.ok) return access;
  const quote = await findQuote(db, actor.workspaceId, quoteId);
  if (!quote) return notFound("Preventivo non trovato.");
  const rows = await db
    .select()
    .from(quoteVersions)
    .where(and(eq(quoteVersions.workspaceId, actor.workspaceId), eq(quoteVersions.quoteId, quoteId), eq(quoteVersions.versionNo, versionNo)));
  const row = rows[0];
  if (!row) return notFound("Versione non trovata.");
  const snapshot = JSON.parse(row.snapshotJson) as QuoteSnapshot;
  return ok({ snapshot, versionNo: row.versionNo, sha256: row.snapshotSha256, createdAt: row.createdAt });
}

/** Draft snapshot for preview and draft PDF. Logo embedded so the PDF never fetches over HTTP. */
export async function getDraftSnapshot(db: AppDatabase, actor: Actor, quoteId: string): Promise<Result<QuoteSnapshot>> {
  const access = await authorize(db, actor, "quotes.read");
  if (!access.ok) return access;
  const quote = await findQuote(db, actor.workspaceId, quoteId);
  if (!quote) return notFound("Preventivo non trovato.");
  const [config, draft] = await Promise.all([getWorkspaceConfig(db, actor), findDraft(db, actor.workspaceId, quoteId)]);
  if (!config.ok) return config;
  const document = draft ? parseDocument(draft.blocksJson) : null;
  if (!document) return invalid("La bozza non è leggibile.");
  return ok(await buildSnapshot(db, actor, config.value, quote, document, { embedLogo: true }));
}

/** Copies a version back into the draft. The version itself never changes. */
export async function restoreVersion(
  db: AppDatabase,
  actor: Actor,
  quoteId: string,
  versionNo: number,
  revision: number,
): Promise<Result<{ revision: number }>> {
  const access = await authorize(db, actor, "quotes.write");
  if (!access.ok) return access;
  const quote = await findQuote(db, actor.workspaceId, quoteId);
  if (!quote) return notFound("Preventivo non trovato.");
  if (!isEditable(asQuoteStatus(quote.status))) return conflict("Questo preventivo è stato accettato e non si può più modificare.");
  const version = await getVersionSnapshot(db, actor, quoteId, versionNo);
  if (!version.ok) return version;
  const document = version.value.snapshot.document;
  const now = new Date();
  const updated = await db
    .update(quoteDrafts)
    .set({ blocksJson: JSON.stringify(document), revision: revision + 1, updatedAt: now })
    .where(and(eq(quoteDrafts.workspaceId, actor.workspaceId), eq(quoteDrafts.quoteId, quoteId), eq(quoteDrafts.revision, revision)))
    .returning({ revision: quoteDrafts.revision });
  if (updated.length === 0) return conflict("La bozza è cambiata nel frattempo. Ricarica la pagina e riprova.");
  const config = await getWorkspaceConfig(db, actor);
  if (!config.ok) return config;
  const totals = computeTotals(document, fiscalOf(config.value));
  await db
    .update(quotes)
    .set({
      title: version.value.snapshot.quote.title,
      templateId: templateIdFor(version.value.snapshot.template),
      totalCents: totals.main.oneTime.totalCents,
      recurringCents: totals.main.monthly.totalCents + totals.main.yearly.totalCents,
      updatedAt: now,
    })
    .where(and(eq(quotes.workspaceId, actor.workspaceId), eq(quotes.id, quoteId)));
  await event(db, actor, quoteId, "version_restored", { versionNo });
  return ok({ revision: updated[0]?.revision ?? revision + 1 });
}

export async function duplicateQuote(db: AppDatabase, actor: Actor, quoteId: string): Promise<Result<{ id: string; number: string }>> {
  const access = await authorize(db, actor, "quotes.write");
  if (!access.ok) return access;
  const quote = await findQuote(db, actor.workspaceId, quoteId);
  if (!quote) return notFound("Preventivo non trovato.");
  const [config, draft] = await Promise.all([getWorkspaceConfig(db, actor), findDraft(db, actor.workspaceId, quoteId)]);
  if (!config.ok) return config;
  const document = draft ? parseDocument(draft.blocksJson) : null;
  if (!document) return invalid("La bozza originale non è leggibile.");
  const fresh: QuoteDocument = {
    ...document,
    blocks: document.blocks.map((block) => {
      const id = createId();
      if (block.type === "services" || block.type === "options") {
        return { ...block, id, items: block.items.map((item) => ({ ...item, id: createId() })) };
      }
      return { ...block, id };
    }),
  };
  const now = new Date();
  const number = await reserveQuoteNumber(db, actor.workspaceId, config.value.brand.quoteNumberFormat, config.value.settings.numberReset, now);
  const id = createId();
  const title = `${quote.title} (copia)`.slice(0, 140);
  const totals = computeTotals(fresh, fiscalOf(config.value));
  await db.insert(quotes).values({
    id,
    workspaceId: actor.workspaceId,
    clientId: quote.clientId,
    number,
    title,
    status: "draft",
    validUntil: dateFromIso(romeDate(addDays(now, config.value.settings.defaultValidityDays))),
    ownerId: actor.userId,
    templateId: quote.templateId,
    totalCents: totals.main.oneTime.totalCents,
    recurringCents: totals.main.monthly.totalCents + totals.main.yearly.totalCents,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(quoteDrafts).values({ workspaceId: actor.workspaceId, quoteId: id, revision: 1, blocksJson: JSON.stringify(fresh), updatedAt: now });
  await event(db, actor, id, "created", { number, duplicatedFrom: quote.number });
  await audit(db, actor, "quote.duplicated", id, { from: quoteId });
  return ok({ id, number });
}

export async function deleteQuote(db: AppDatabase, actor: Actor, quoteId: string): Promise<Result<{ id: string }>> {
  const access = await authorize(db, actor, "quotes.read");
  if (!access.ok) return access;
  const quote = await findQuote(db, actor.workspaceId, quoteId);
  if (!quote) return notFound("Preventivo non trovato.");
  const versions = await listVersions(db, actor.workspaceId, quoteId);
  const ownDraft = quote.ownerId === actor.userId && quote.status === "draft" && versions.length === 0;
  if (!can(access.value.role, "quotes.delete") && !ownDraft) {
    return { ok: false, error: "forbidden", message: "Puoi eliminare solo le tue bozze senza versioni. Per gli altri preventivi serve un amministratore." };
  }
  const now = new Date();
  await db
    .update(quotes)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(quotes.workspaceId, actor.workspaceId), eq(quotes.id, quoteId)));
  await audit(db, actor, "quote.deleted", quoteId, { number: quote.number });
  return ok({ id: quoteId });
}

const imageMimes = new Set(["image/png", "image/jpeg"]);
export const quoteImageMaxBytes = 1536 * 1024;

/** Stores a block image in the workspace database. PNG and JPG only: they render the same in browser and PDF. */
export async function uploadQuoteImage(
  db: AppDatabase,
  actor: Actor,
  quoteId: string,
  file: { bytes: Uint8Array; filename: string },
): Promise<Result<{ assetId: string }>> {
  const access = await authorize(db, actor, "quotes.write");
  if (!access.ok) return access;
  const quote = await findQuote(db, actor.workspaceId, quoteId);
  if (!quote) return notFound("Preventivo non trovato.");
  if (file.bytes.length === 0) return invalid("Il file è vuoto.");
  if (file.bytes.length > quoteImageMaxBytes) return invalid("L'immagine supera 1,5 MB. Riducila e riprova.");
  const b = file.bytes;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const mime = png ? "image/png" : jpg ? "image/jpeg" : null;
  if (!mime || !imageMimes.has(mime)) return invalid("Formato non supportato. Usa PNG o JPG.");
  const assetId = createId();
  await db.insert(assets).values({
    id: assetId,
    workspaceId: actor.workspaceId,
    blobKey: `db:${assetId}`,
    sha256: createHash("sha256").update(b).digest("hex"),
    mime,
    sizeBytes: b.length,
    filename: file.filename.replace(/[^\w.\- ]+/g, "_").trim().slice(0, 100) || "immagine",
    createdAt: new Date(),
  });
  await db.insert(assetBlobs).values({ workspaceId: actor.workspaceId, assetId, data: Buffer.from(b) });
  await audit(db, actor, "quote.image_uploaded", quoteId);
  return ok({ assetId });
}

/** Bytes of the images referenced by a snapshot, scoped to the workspace. Used by the PDF renderer. */
export async function loadSnapshotImages(db: AppDatabase, actor: Actor, snapshot: QuoteSnapshot): Promise<Map<string, { mime: string; data: Buffer }>> {
  return loadSnapshotImagesFor(db, actor.workspaceId, snapshot);
}

/** Same as loadSnapshotImages for background jobs, which run without a signed-in user. */
export async function loadSnapshotImagesFor(db: AppDatabase, workspaceId: string, snapshot: QuoteSnapshot): Promise<Map<string, { mime: string; data: Buffer }>> {
  const ids = snapshot.images.map((image) => image.id);
  const map = new Map<string, { mime: string; data: Buffer }>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ id: assets.id, mime: assets.mime, data: assetBlobs.data })
    .from(assets)
    .innerJoin(assetBlobs, and(eq(assetBlobs.workspaceId, assets.workspaceId), eq(assetBlobs.assetId, assets.id)))
    .where(and(eq(assets.workspaceId, workspaceId), inArray(assets.id, ids)));
  for (const row of rows) map.set(row.id, { mime: row.mime, data: Buffer.from(row.data) });
  return map;
}

/** Light client list for the wizard and the editor details tab. */
export async function listClientOptions(db: AppDatabase, actor: Actor) {
  const access = await authorize(db, actor, "clients.read");
  if (!access.ok) return access;
  const rows = await db
    .select({ id: clients.id, name: clients.name, kind: clients.kind, sector: clients.sector, email: clients.email, status: clients.status })
    .from(clients)
    .where(and(eq(clients.workspaceId, actor.workspaceId), isNull(clients.deletedAt), sql`${clients.status} <> 'archived'`))
    .orderBy(asc(sql`lower(${clients.name})`))
    .limit(1000);
  return ok(rows.map((row) => ({ ...row, kind: asKind(row.kind) })));
}

export type ClientOption = { id: string; name: string; kind: ClientKind; sector: string | null; email: string | null; status: string };
