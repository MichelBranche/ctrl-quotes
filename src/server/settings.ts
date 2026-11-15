import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { assetBlobs, assets, brandKits, workspaceSettings, workspaces } from "@/db/schema";
import { asBrandFont, brandInputSchema, sniffLogo, type BrandFont } from "@/domain/brand";
import { firstIssue } from "@/domain/clients";
import { createId } from "@/domain/ids";
import type { PriceMode, TaxProfile } from "@/domain/pricing";
import { fiscalSettingsSchema, numberingSettingsSchema, termsSettingsSchema } from "@/domain/settings";
import { authorize, invalid, notFound, ok, type Actor, type Result } from "@/server/access";
import { writeAuditLog } from "@/server/audit";
import type { WorkspaceSummary } from "@/server/workspaces";

export type BrandKit = {
  companyName: string | null;
  vatNumber: string | null;
  taxCode: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  colorPrimary: string;
  colorSecondary: string;
  colorBackground: string;
  fontHeading: BrandFont;
  fontBody: BrandFont;
  quoteNumberFormat: string;
  defaultTerms: string | null;
  applyAutomatically: boolean;
  logo: { assetId: string; mime: string; filename: string; updatedAt: number } | null;
};

export type WorkspaceSettings = {
  defaultTaxRateBp: number;
  defaultPriceMode: PriceMode;
  defaultValidityDays: number;
  stampDutyNote: boolean;
  numberReset: "yearly" | "never";
  defaultTemplateId: string | null;
};

export type WorkspaceConfig = { workspace: WorkspaceSummary; brand: BrandKit; settings: WorkspaceSettings };

export const defaultBrand: Omit<BrandKit, "logo"> = {
  companyName: null,
  vatNumber: null,
  taxCode: null,
  address: null,
  email: null,
  phone: null,
  website: null,
  colorPrimary: "#0B0B0F",
  colorSecondary: "#7C3AED",
  colorBackground: "#F4F2FF",
  fontHeading: "template",
  fontBody: "template",
  quoteNumberFormat: "QT-{YYYY}-{0000}",
  defaultTerms: null,
  applyAutomatically: true,
};

export const defaultSettings: WorkspaceSettings = {
  defaultTaxRateBp: 2200,
  defaultPriceMode: "net",
  defaultValidityDays: 30,
  stampDutyNote: true,
  numberReset: "yearly",
  defaultTemplateId: null,
};

export async function loadBrand(db: AppDatabase, workspaceId: string): Promise<BrandKit> {
  const rows = await db.select().from(brandKits).where(eq(brandKits.workspaceId, workspaceId));
  const row = rows[0];
  if (!row) return { ...defaultBrand, logo: null };
  let logo: BrandKit["logo"] = null;
  if (row.logoAssetId) {
    const assetRows = await db
      .select({ id: assets.id, mime: assets.mime, filename: assets.filename, createdAt: assets.createdAt })
      .from(assets)
      .where(and(eq(assets.workspaceId, workspaceId), eq(assets.id, row.logoAssetId)));
    const asset = assetRows[0];
    if (asset) logo = { assetId: asset.id, mime: asset.mime, filename: asset.filename, updatedAt: asset.createdAt.getTime() };
  }
  return {
    companyName: row.companyName,
    vatNumber: row.vatNumber,
    taxCode: row.taxCode,
    address: row.address,
    email: row.email,
    phone: row.phone,
    website: row.website,
    colorPrimary: row.colorPrimary,
    colorSecondary: row.colorSecondary,
    colorBackground: row.colorBackground,
    fontHeading: asBrandFont(row.fontHeading),
    fontBody: asBrandFont(row.fontBody),
    quoteNumberFormat: row.quoteNumberFormat,
    defaultTerms: row.defaultTerms,
    applyAutomatically: row.applyAutomatically,
    logo,
  };
}

async function loadSettings(db: AppDatabase, workspaceId: string): Promise<WorkspaceSettings> {
  const rows = await db.select().from(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId));
  const row = rows[0];
  if (!row) return defaultSettings;
  return {
    defaultTaxRateBp: row.defaultTaxRateBp,
    defaultPriceMode: row.defaultPriceMode === "gross" ? "gross" : "net",
    defaultValidityDays: row.defaultValidityDays,
    stampDutyNote: row.stampDutyNote,
    numberReset: row.numberReset === "never" ? "never" : "yearly",
    defaultTemplateId: row.defaultTemplateId,
  };
}

export async function getWorkspaceConfig(db: AppDatabase, actor: Actor): Promise<Result<WorkspaceConfig>> {
  const access = await authorize(db, actor, "clients.read");
  if (!access.ok) return access;
  const [brand, settings] = await Promise.all([loadBrand(db, actor.workspaceId), loadSettings(db, actor.workspaceId)]);
  return ok({ workspace: access.value, brand, settings });
}

async function upsertBrand(db: AppDatabase, workspaceId: string, values: Partial<typeof brandKits.$inferInsert>) {
  const now = new Date();
  await db
    .insert(brandKits)
    .values({ id: createId(), workspaceId, ...values, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: brandKits.workspaceId, set: { ...values, updatedAt: now } });
}

export async function upsertSettings(
  db: AppDatabase,
  workspaceId: string,
  values: Partial<typeof workspaceSettings.$inferInsert>,
) {
  const now = new Date();
  await db
    .insert(workspaceSettings)
    .values({ workspaceId, ...values, updatedAt: now })
    .onConflictDoUpdate({ target: workspaceSettings.workspaceId, set: { ...values, updatedAt: now } });
}

async function audit(db: AppDatabase, actor: Actor, action: string) {
  await writeAuditLog(db, {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action,
    entityType: "workspace",
    entityId: actor.workspaceId,
  });
}

export async function saveBrand(db: AppDatabase, actor: Actor, raw: unknown): Promise<Result<null>> {
  const access = await authorize(db, actor, "brand.write");
  if (!access.ok) return access;
  const parsed = brandInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(firstIssue(parsed.error));
  await upsertBrand(db, actor.workspaceId, parsed.data);
  await audit(db, actor, "brand.updated");
  return ok(null);
}

export async function saveFiscal(db: AppDatabase, actor: Actor, raw: unknown): Promise<Result<null>> {
  const access = await authorize(db, actor, "settings.write");
  if (!access.ok) return access;
  const parsed = fiscalSettingsSchema.safeParse(raw);
  if (!parsed.success) return invalid(firstIssue(parsed.error));
  const { taxProfile, ...rest } = parsed.data;
  await db
    .update(workspaces)
    .set({ taxProfile: taxProfile satisfies TaxProfile, updatedAt: new Date() })
    .where(eq(workspaces.id, actor.workspaceId));
  await upsertSettings(db, actor.workspaceId, rest);
  await audit(db, actor, "settings.fiscal_updated");
  return ok(null);
}

export async function saveNumbering(db: AppDatabase, actor: Actor, raw: unknown): Promise<Result<null>> {
  const access = await authorize(db, actor, "settings.write");
  if (!access.ok) return access;
  const parsed = numberingSettingsSchema.safeParse(raw);
  if (!parsed.success) return invalid(firstIssue(parsed.error));
  await upsertBrand(db, actor.workspaceId, { quoteNumberFormat: parsed.data.format });
  await upsertSettings(db, actor.workspaceId, { numberReset: parsed.data.numberReset });
  await audit(db, actor, "settings.numbering_updated");
  return ok(null);
}

export async function saveTerms(db: AppDatabase, actor: Actor, raw: unknown): Promise<Result<null>> {
  const access = await authorize(db, actor, "settings.write");
  if (!access.ok) return access;
  const parsed = termsSettingsSchema.safeParse(raw);
  if (!parsed.success) return invalid(firstIssue(parsed.error));
  await upsertBrand(db, actor.workspaceId, { defaultTerms: parsed.data.defaultTerms });
  await upsertSettings(db, actor.workspaceId, { defaultValidityDays: parsed.data.defaultValidityDays });
  await audit(db, actor, "settings.terms_updated");
  return ok(null);
}

function safeFilename(name: string): string {
  const cleaned = name.replace(/[^\w.\- ]+/g, "_").trim().slice(0, 100);
  return cleaned || "logo";
}

/** Stores the logo inside the workspace database: no external storage service is involved. */
export async function setLogo(
  db: AppDatabase,
  actor: Actor,
  file: { bytes: Uint8Array; filename: string },
): Promise<Result<{ assetId: string }>> {
  const access = await authorize(db, actor, "brand.write");
  if (!access.ok) return access;
  const sniffed = sniffLogo(file.bytes);
  if (!sniffed.ok) return invalid(sniffed.message);
  const previous = (await loadBrand(db, actor.workspaceId)).logo;
  const assetId = createId();
  const sha256 = createHash("sha256").update(file.bytes).digest("hex");
  await db.insert(assets).values({
    id: assetId,
    workspaceId: actor.workspaceId,
    blobKey: `db:${assetId}`,
    sha256,
    mime: sniffed.mime,
    sizeBytes: file.bytes.length,
    filename: safeFilename(file.filename),
    createdAt: new Date(),
  });
  await db.insert(assetBlobs).values({ workspaceId: actor.workspaceId, assetId, data: Buffer.from(file.bytes) });
  await upsertBrand(db, actor.workspaceId, { logoAssetId: assetId });
  if (previous) await dropAsset(db, actor.workspaceId, previous.assetId);
  await audit(db, actor, "brand.logo_updated");
  return ok({ assetId });
}

async function dropAsset(db: AppDatabase, workspaceId: string, assetId: string) {
  await db.delete(assets).where(and(eq(assets.workspaceId, workspaceId), eq(assets.id, assetId)));
}

export async function removeLogo(db: AppDatabase, actor: Actor): Promise<Result<null>> {
  const access = await authorize(db, actor, "brand.write");
  if (!access.ok) return access;
  const previous = (await loadBrand(db, actor.workspaceId)).logo;
  if (!previous) return notFound("Nessun logo da rimuovere.");
  await upsertBrand(db, actor.workspaceId, { logoAssetId: null });
  await dropAsset(db, actor.workspaceId, previous.assetId);
  await audit(db, actor, "brand.logo_removed");
  return ok(null);
}

export async function readAsset(
  db: AppDatabase,
  actor: Actor,
  assetId: string,
): Promise<Result<{ bytes: Buffer; mime: string; sha256: string }>> {
  const access = await authorize(db, actor, "clients.read");
  if (!access.ok) return access;
  const rows = await db
    .select({ data: assetBlobs.data, mime: assets.mime, sha256: assets.sha256 })
    .from(assets)
    .innerJoin(assetBlobs, and(eq(assetBlobs.workspaceId, assets.workspaceId), eq(assetBlobs.assetId, assets.id)))
    .where(and(eq(assets.workspaceId, actor.workspaceId), eq(assets.id, assetId)));
  const row = rows[0];
  if (!row) return notFound("File non trovato.");
  return ok({ bytes: row.data, mime: row.mime, sha256: row.sha256 });
}
