import { and, asc, count, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { catalogCategories, catalogItems, catalogPackageItems } from "@/db/schema";
import {
  catalogItemInputSchema,
  categoryNameSchema,
  type CatalogBilling,
  type CatalogItemInput,
  type CatalogType,
} from "@/domain/catalog";
import { firstIssue, likePattern } from "@/domain/clients";
import { createId } from "@/domain/ids";
import type { PriceMode } from "@/domain/pricing";
import { authorize, conflict, invalid, notFound, ok, type Actor, type Result } from "@/server/access";
import { writeAuditLog } from "@/server/audit";

export type CatalogItemRow = {
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
  optionalDefault: boolean;
  categoryId: string | null;
  categoryName: string | null;
  updatedAt: Date;
};

export type PackageComponent = {
  itemId: string;
  quantityMilli: number;
  name: string;
  type: CatalogType;
  unitPriceCents: number;
  priceMode: PriceMode;
  taxRateBp: number;
  billing: CatalogBilling;
};

export type CatalogItemDetail = CatalogItemRow & { components: PackageComponent[]; usedInPackages: number };

export type Category = { id: string; name: string; itemCount: number };

export type CatalogFilter = CatalogType | "all";

export type CatalogListQuery = {
  q?: string;
  type?: CatalogFilter;
  categoryId?: string;
  page?: number;
  pageSize?: number;
};

export type CatalogList = {
  items: CatalogItemRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<CatalogFilter, number>;
  /** Elementi non eliminati nel workspace, senza ricerca né filtri. */
  workspaceTotal: number;
};

const columns = {
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
  optionalDefault: catalogItems.optionalDefault,
  categoryId: catalogItems.categoryId,
  categoryName: catalogCategories.name,
  updatedAt: catalogItems.updatedAt,
};

function asType(value: string): CatalogType {
  return value === "prodotto" ? "prodotto" : value === "pacchetto" ? "pacchetto" : "servizio";
}

function asBilling(value: string): CatalogBilling {
  return value === "mensile" ? "mensile" : value === "annuale" ? "annuale" : "una_tantum";
}

function asMode(value: string): PriceMode {
  return value === "gross" ? "gross" : "net";
}

type RawRow = Omit<CatalogItemRow, "type" | "billing" | "priceMode"> & { type: string; billing: string; priceMode: string };

function asRow(row: RawRow): CatalogItemRow {
  return { ...row, type: asType(row.type), billing: asBilling(row.billing), priceMode: asMode(row.priceMode) };
}

function joinCategory() {
  return and(
    eq(catalogCategories.workspaceId, catalogItems.workspaceId),
    eq(catalogCategories.id, catalogItems.categoryId),
  );
}

function searchCondition(q: string | undefined): SQL | undefined {
  const query = q?.trim();
  if (!query) return undefined;
  const pattern = likePattern(query);
  return or(
    sql`${catalogItems.name} like ${pattern} escape '\\'`,
    sql`coalesce(${catalogItems.description}, '') like ${pattern} escape '\\'`,
  );
}

export async function listCatalog(
  db: AppDatabase,
  actor: Actor,
  query: CatalogListQuery = {},
): Promise<Result<CatalogList>> {
  const access = await authorize(db, actor, "catalog.read");
  if (!access.ok) return access;
  const type = query.type ?? "all";
  const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  const base = [eq(catalogItems.workspaceId, actor.workspaceId), isNull(catalogItems.deletedAt)];
  const search = searchCondition(query.q);
  const category = query.categoryId ? eq(catalogItems.categoryId, query.categoryId) : undefined;
  const typeCondition = type === "all" ? undefined : eq(catalogItems.type, type);
  const where = and(...base, search, category, typeCondition);

  const [items, totalRows, countRows, workspaceRows] = await Promise.all([
    db
      .select(columns)
      .from(catalogItems)
      .leftJoin(catalogCategories, joinCategory())
      .where(where)
      .orderBy(asc(sql`lower(${catalogItems.name})`), asc(catalogItems.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(catalogItems).where(where),
    db
      .select({ type: catalogItems.type, value: count() })
      .from(catalogItems)
      .where(and(...base, search, category))
      .groupBy(catalogItems.type),
    db.select({ value: count() }).from(catalogItems).where(and(...base)),
  ]);
  const counts: Record<CatalogFilter, number> = { all: 0, servizio: 0, prodotto: 0, pacchetto: 0 };
  for (const row of countRows) {
    counts[asType(row.type)] = row.value;
    counts.all += row.value;
  }
  return ok({
    items: items.map(asRow),
    total: totalRows[0]?.value ?? 0,
    page,
    pageSize,
    counts,
    workspaceTotal: workspaceRows[0]?.value ?? 0,
  });
}

async function findItem(db: AppDatabase, workspaceId: string, itemId: string): Promise<CatalogItemRow | null> {
  const rows = await db
    .select(columns)
    .from(catalogItems)
    .leftJoin(catalogCategories, joinCategory())
    .where(and(eq(catalogItems.workspaceId, workspaceId), eq(catalogItems.id, itemId), isNull(catalogItems.deletedAt)));
  return rows[0] ? asRow(rows[0]) : null;
}

async function loadComponents(db: AppDatabase, workspaceId: string, packageId: string): Promise<PackageComponent[]> {
  const rows = await db
    .select({
      itemId: catalogPackageItems.itemId,
      quantityMilli: catalogPackageItems.quantityMilli,
      name: catalogItems.name,
      type: catalogItems.type,
      unitPriceCents: catalogItems.unitPriceCents,
      priceMode: catalogItems.priceMode,
      taxRateBp: catalogItems.taxRateBp,
      billing: catalogItems.billing,
    })
    .from(catalogPackageItems)
    .innerJoin(
      catalogItems,
      and(eq(catalogItems.workspaceId, catalogPackageItems.workspaceId), eq(catalogItems.id, catalogPackageItems.itemId)),
    )
    .where(and(eq(catalogPackageItems.workspaceId, workspaceId), eq(catalogPackageItems.packageId, packageId)))
    .orderBy(asc(catalogItems.name));
  return rows.map((row) => ({
    ...row,
    type: asType(row.type),
    billing: asBilling(row.billing),
    priceMode: asMode(row.priceMode),
  }));
}

async function usageCount(db: AppDatabase, workspaceId: string, itemId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(catalogPackageItems)
    .innerJoin(
      catalogItems,
      and(eq(catalogItems.workspaceId, catalogPackageItems.workspaceId), eq(catalogItems.id, catalogPackageItems.packageId)),
    )
    .where(
      and(
        eq(catalogPackageItems.workspaceId, workspaceId),
        eq(catalogPackageItems.itemId, itemId),
        isNull(catalogItems.deletedAt),
      ),
    );
  return rows[0]?.value ?? 0;
}

export async function getCatalogItem(
  db: AppDatabase,
  actor: Actor,
  itemId: string,
): Promise<Result<CatalogItemDetail>> {
  const access = await authorize(db, actor, "catalog.read");
  if (!access.ok) return access;
  const item = await findItem(db, actor.workspaceId, itemId);
  if (!item) return notFound("Elemento del catalogo non trovato.");
  const [components, usedInPackages] = await Promise.all([
    item.type === "pacchetto" ? loadComponents(db, actor.workspaceId, itemId) : Promise.resolve([]),
    usageCount(db, actor.workspaceId, itemId),
  ]);
  return ok({ ...item, components, usedInPackages });
}

/** Options for package composition: every non-package item of the workspace. */
export async function listComponentOptions(db: AppDatabase, actor: Actor) {
  const access = await authorize(db, actor, "catalog.read");
  if (!access.ok) return access;
  const rows = await db
    .select(columns)
    .from(catalogItems)
    .leftJoin(catalogCategories, joinCategory())
    .where(
      and(
        eq(catalogItems.workspaceId, actor.workspaceId),
        isNull(catalogItems.deletedAt),
        sql`${catalogItems.type} <> 'pacchetto'`,
      ),
    )
    .orderBy(asc(sql`lower(${catalogItems.name})`))
    .limit(500);
  return ok(rows.map(asRow));
}

async function validateReferences(
  db: AppDatabase,
  workspaceId: string,
  input: CatalogItemInput,
  selfId: string | null,
): Promise<string | null> {
  if (input.categoryId) {
    const rows = await db
      .select({ id: catalogCategories.id })
      .from(catalogCategories)
      .where(and(eq(catalogCategories.workspaceId, workspaceId), eq(catalogCategories.id, input.categoryId)));
    if (rows.length === 0) return "La categoria scelta non esiste in questo workspace.";
  }
  if (input.components.length > 0) {
    const ids = input.components.map((component) => component.itemId);
    if (selfId && ids.includes(selfId)) return "Un pacchetto non può contenere sé stesso.";
    const rows = await db
      .select({ id: catalogItems.id, type: catalogItems.type })
      .from(catalogItems)
      .where(
        and(eq(catalogItems.workspaceId, workspaceId), inArray(catalogItems.id, ids), isNull(catalogItems.deletedAt)),
      );
    if (rows.length !== ids.length) return "Una delle voci del pacchetto non esiste più.";
    if (rows.some((row) => row.type === "pacchetto")) return "Un pacchetto non può contenere altri pacchetti.";
  }
  return null;
}

async function replaceComponents(db: AppDatabase, workspaceId: string, packageId: string, input: CatalogItemInput) {
  await db
    .delete(catalogPackageItems)
    .where(and(eq(catalogPackageItems.workspaceId, workspaceId), eq(catalogPackageItems.packageId, packageId)));
  if (input.components.length === 0) return;
  await db.insert(catalogPackageItems).values(
    input.components.map((component) => ({
      id: createId(),
      workspaceId,
      packageId,
      itemId: component.itemId,
      quantityMilli: component.quantityMilli,
    })),
  );
}

function columnsFrom(input: CatalogItemInput) {
  return {
    type: input.type,
    name: input.name,
    description: input.description,
    unit: input.unit,
    unitPriceCents: input.unitPriceCents,
    priceMode: input.priceMode,
    taxRateBp: input.taxRateBp,
    taxNature: input.taxNature,
    billing: input.billing,
    periods: input.periods,
    optionalDefault: input.optionalDefault,
    categoryId: input.categoryId,
  };
}

export async function createCatalogItem(
  db: AppDatabase,
  actor: Actor,
  raw: unknown,
): Promise<Result<{ id: string }>> {
  const access = await authorize(db, actor, "catalog.write");
  if (!access.ok) return access;
  const parsed = catalogItemInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(firstIssue(parsed.error));
  const problem = await validateReferences(db, actor.workspaceId, parsed.data, null);
  if (problem) return invalid(problem);
  const id = createId();
  const now = new Date();
  await db.insert(catalogItems).values({
    id,
    workspaceId: actor.workspaceId,
    ...columnsFrom(parsed.data),
    createdAt: now,
    updatedAt: now,
  });
  await replaceComponents(db, actor.workspaceId, id, parsed.data);
  await writeAuditLog(db, {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action: "catalog.created",
    entityType: "catalog_item",
    entityId: id,
  });
  return ok({ id });
}

export async function updateCatalogItem(
  db: AppDatabase,
  actor: Actor,
  itemId: string,
  raw: unknown,
): Promise<Result<{ id: string }>> {
  const access = await authorize(db, actor, "catalog.write");
  if (!access.ok) return access;
  const existing = await findItem(db, actor.workspaceId, itemId);
  if (!existing) return notFound("Elemento del catalogo non trovato.");
  const parsed = catalogItemInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(firstIssue(parsed.error));
  if (existing.type !== "pacchetto" && parsed.data.type === "pacchetto") {
    const used = await usageCount(db, actor.workspaceId, itemId);
    if (used > 0) return conflict("Questa voce è inclusa in un pacchetto e non può diventare a sua volta un pacchetto.");
  }
  const problem = await validateReferences(db, actor.workspaceId, parsed.data, itemId);
  if (problem) return invalid(problem);
  await db
    .update(catalogItems)
    .set({ ...columnsFrom(parsed.data), updatedAt: new Date() })
    .where(and(eq(catalogItems.workspaceId, actor.workspaceId), eq(catalogItems.id, itemId)));
  await replaceComponents(db, actor.workspaceId, itemId, parsed.data);
  await writeAuditLog(db, {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action: "catalog.updated",
    entityType: "catalog_item",
    entityId: itemId,
  });
  return ok({ id: itemId });
}

export async function duplicateCatalogItem(
  db: AppDatabase,
  actor: Actor,
  itemId: string,
): Promise<Result<{ id: string }>> {
  const access = await authorize(db, actor, "catalog.write");
  if (!access.ok) return access;
  const existing = await findItem(db, actor.workspaceId, itemId);
  if (!existing) return notFound("Elemento del catalogo non trovato.");
  const components = existing.type === "pacchetto" ? await loadComponents(db, actor.workspaceId, itemId) : [];
  const id = createId();
  const now = new Date();
  const name = `${existing.name} (copia)`.slice(0, 120);
  await db.insert(catalogItems).values({
    id,
    workspaceId: actor.workspaceId,
    type: existing.type,
    name,
    description: existing.description,
    unit: existing.unit,
    unitPriceCents: existing.unitPriceCents,
    priceMode: existing.priceMode,
    taxRateBp: existing.taxRateBp,
    taxNature: existing.taxNature,
    billing: existing.billing,
    periods: existing.periods,
    optionalDefault: existing.optionalDefault,
    categoryId: existing.categoryId,
    createdAt: now,
    updatedAt: now,
  });
  if (components.length > 0) {
    await db.insert(catalogPackageItems).values(
      components.map((component) => ({
        id: createId(),
        workspaceId: actor.workspaceId,
        packageId: id,
        itemId: component.itemId,
        quantityMilli: component.quantityMilli,
      })),
    );
  }
  await writeAuditLog(db, {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action: "catalog.duplicated",
    entityType: "catalog_item",
    entityId: id,
    meta: { source: itemId },
  });
  return ok({ id });
}

export async function deleteCatalogItem(
  db: AppDatabase,
  actor: Actor,
  itemId: string,
): Promise<Result<{ id: string }>> {
  const access = await authorize(db, actor, "catalog.delete");
  if (!access.ok) return access;
  const existing = await findItem(db, actor.workspaceId, itemId);
  if (!existing) return notFound("Elemento del catalogo non trovato.");
  const used = await usageCount(db, actor.workspaceId, itemId);
  if (used > 0) {
    return conflict(
      used === 1
        ? "Questa voce fa parte di un pacchetto. Rimuovila dal pacchetto prima di eliminarla."
        : `Questa voce fa parte di ${used} pacchetti. Rimuovila dai pacchetti prima di eliminarla.`,
    );
  }
  const now = new Date();
  await db
    .update(catalogItems)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(catalogItems.workspaceId, actor.workspaceId), eq(catalogItems.id, itemId)));
  await writeAuditLog(db, {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action: "catalog.deleted",
    entityType: "catalog_item",
    entityId: itemId,
  });
  return ok({ id: itemId });
}

export async function listCategories(db: AppDatabase, actor: Actor): Promise<Result<Category[]>> {
  const access = await authorize(db, actor, "catalog.read");
  if (!access.ok) return access;
  const rows = await db
    .select({
      id: catalogCategories.id,
      name: catalogCategories.name,
      itemCount: sql<number>`count(${catalogItems.id})`,
    })
    .from(catalogCategories)
    .leftJoin(
      catalogItems,
      and(
        eq(catalogItems.workspaceId, catalogCategories.workspaceId),
        eq(catalogItems.categoryId, catalogCategories.id),
        isNull(catalogItems.deletedAt),
      ),
    )
    .where(eq(catalogCategories.workspaceId, actor.workspaceId))
    .groupBy(catalogCategories.id, catalogCategories.name)
    .orderBy(asc(sql`lower(${catalogCategories.name})`));
  return ok(rows.map((row) => ({ ...row, itemCount: Number(row.itemCount) })));
}

async function categoryNameTaken(db: AppDatabase, workspaceId: string, name: string, exceptId: string | null) {
  const rows = await db
    .select({ id: catalogCategories.id })
    .from(catalogCategories)
    .where(and(eq(catalogCategories.workspaceId, workspaceId), sql`lower(${catalogCategories.name}) = lower(${name})`));
  return rows.some((row) => row.id !== exceptId);
}

export async function createCategory(db: AppDatabase, actor: Actor, rawName: unknown): Promise<Result<{ id: string }>> {
  const access = await authorize(db, actor, "catalog.categories");
  if (!access.ok) return access;
  const parsed = categoryNameSchema.safeParse(rawName);
  if (!parsed.success) return invalid(firstIssue(parsed.error));
  if (await categoryNameTaken(db, actor.workspaceId, parsed.data, null)) {
    return conflict("Esiste già una categoria con questo nome.");
  }
  const id = createId();
  await db.insert(catalogCategories).values({ id, workspaceId: actor.workspaceId, name: parsed.data, createdAt: new Date() });
  return ok({ id });
}

export async function renameCategory(
  db: AppDatabase,
  actor: Actor,
  categoryId: string,
  rawName: unknown,
): Promise<Result<{ id: string }>> {
  const access = await authorize(db, actor, "catalog.categories");
  if (!access.ok) return access;
  const parsed = categoryNameSchema.safeParse(rawName);
  if (!parsed.success) return invalid(firstIssue(parsed.error));
  if (await categoryNameTaken(db, actor.workspaceId, parsed.data, categoryId)) {
    return conflict("Esiste già una categoria con questo nome.");
  }
  const updated = await db
    .update(catalogCategories)
    .set({ name: parsed.data })
    .where(and(eq(catalogCategories.workspaceId, actor.workspaceId), eq(catalogCategories.id, categoryId)))
    .returning({ id: catalogCategories.id });
  if (updated.length === 0) return notFound("Categoria non trovata.");
  return ok({ id: categoryId });
}

/** Items keep existing; they only lose the category. */
export async function deleteCategory(db: AppDatabase, actor: Actor, categoryId: string): Promise<Result<{ id: string }>> {
  const access = await authorize(db, actor, "catalog.categories");
  if (!access.ok) return access;
  const removed = await db
    .delete(catalogCategories)
    .where(and(eq(catalogCategories.workspaceId, actor.workspaceId), eq(catalogCategories.id, categoryId)))
    .returning({ id: catalogCategories.id });
  if (removed.length === 0) return notFound("Categoria non trovata.");
  await db
    .update(catalogItems)
    .set({ categoryId: null })
    .where(and(eq(catalogItems.workspaceId, actor.workspaceId), eq(catalogItems.categoryId, categoryId)));
  return ok({ id: categoryId });
}
