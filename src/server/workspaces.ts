import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import {
  assetBlobs,
  assets,
  brandKits,
  catalogCategories,
  catalogItems,
  catalogPackageItems,
  clientContacts,
  clientNotes,
  clients,
  emailDeliveries,
  notifications,
  notificationPrefs,
  outboxJobs,
  quoteAcceptances,
  quoteChangeRequests,
  quoteDrafts,
  quoteEvents,
  quoteLineItems,
  quoteNumberSequences,
  quotePublicLinks,
  quoteSections,
  quoteVersions,
  quotes,
  redeemCodeUses,
  subscriptionEvents,
  subscriptions,
  templateFavorites,
  templatePresets,
  usageCounters,
  workspaceMemberships,
  workspaceSettings,
  workspaces,
} from "@/db/schema";
import { assertWorkspaceId, createId, slugify } from "@/domain/ids";
import { hasRole, isRole, type Role } from "@/domain/roles";
import type { TaxProfile } from "@/domain/pricing";
import type { PlanId } from "@/domain/plans";
import { activePlanOverride } from "@/domain/redeem";

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "studio";
  /** Plan unlocked by a redeem code and still in force, or null. */
  planOverride: PlanId | null;
  /** End of that override; null with an override = lifetime. */
  planOverrideUntil: number | null;
  taxProfile: TaxProfile;
  role: Role;
};

export type AccessFailure = "not_found" | "forbidden";

function isPlan(value: string): value is WorkspaceSummary["plan"] {
  switch (value) {
    case "free":
    case "pro":
    case "studio":
      return true;
    default:
      return false;
  }
}

function isTaxProfile(value: string): value is TaxProfile {
  switch (value) {
    case "ordinario":
    case "forfettario":
    case "estero":
      return true;
    default:
      return false;
  }
}

async function uniqueSlug(db: AppDatabase, name: string, excludeId?: string): Promise<string> {
  const base = slugify(name);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${createId().slice(0, 6)}`;
    const existing = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(excludeId ? and(eq(workspaces.slug, slug), ne(workspaces.id, excludeId)) : eq(workspaces.slug, slug));
    if (existing.length === 0) return slug;
  }
  return `${base}-${createId().slice(0, 8)}`;
}

export async function createWorkspace(
  db: AppDatabase,
  input: { userId: string; name: string; taxProfile: TaxProfile },
): Promise<WorkspaceSummary> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) {
    throw new Error("Il nome del workspace deve avere tra 2 e 80 caratteri.");
  }
  const now = new Date();
  const id = createId();
  const slug = await uniqueSlug(db, name);
  await db.insert(workspaces).values({
    id,
    name,
    slug,
    plan: "free",
    taxProfile: input.taxProfile,
    currency: "EUR",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(workspaceMemberships).values({
    workspaceId: id,
    userId: input.userId,
    role: "owner",
    createdAt: now,
  });
  return { id, name, slug, plan: "free", planOverride: null, planOverrideUntil: null, taxProfile: input.taxProfile, role: "owner" };
}

export async function listWorkspaces(db: AppDatabase, userId: string): Promise<WorkspaceSummary[]> {
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      plan: workspaces.plan,
      overridePlan: workspaces.planOverride,
      overrideUntil: workspaces.planOverrideUntil,
      taxProfile: workspaces.taxProfile,
      role: workspaceMemberships.role,
    })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(and(eq(workspaceMemberships.userId, userId), isNull(workspaces.deletedAt)));

  return rows.flatMap((row) => {
    if (!isPlan(row.plan) || !isTaxProfile(row.taxProfile) || !isRole(row.role)) return [];
    const { overridePlan, overrideUntil, ...rest } = row;
    const until = overrideUntil ? overrideUntil.getTime() : null;
    const planOverride = activePlanOverride(overridePlan, until);
    return [{ ...rest, plan: row.plan, planOverride, planOverrideUntil: planOverride ? until : null, taxProfile: row.taxProfile, role: row.role }];
  });
}

export async function getWorkspaceForUser(
  db: AppDatabase,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceSummary | null> {
  assertWorkspaceId(workspaceId);
  const rows = await listWorkspaces(db, userId);
  return rows.find((row) => row.id === workspaceId) ?? null;
}

export async function updateWorkspace(
  db: AppDatabase,
  input: { userId: string; workspaceId: string; name: string; slug?: string },
): Promise<{ ok: true; workspace: WorkspaceSummary } | { ok: false; error: AccessFailure }> {
  const current = await getWorkspaceForUser(db, input.userId, input.workspaceId);
  if (!current) return { ok: false, error: "not_found" };
  if (!hasRole(current.role, "admin")) return { ok: false, error: "forbidden" };
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) {
    throw new Error("Il nome del workspace deve avere tra 2 e 80 caratteri.");
  }
  const slug = input.slug !== undefined ? await uniqueSlug(db, input.slug, current.id) : current.slug;
  await db
    .update(workspaces)
    .set({ name, slug, updatedAt: new Date() })
    .where(and(eq(workspaces.id, input.workspaceId), isNull(workspaces.deletedAt)));
  return { ok: true, workspace: { ...current, name, slug } };
}

export async function addMember(
  db: AppDatabase,
  input: { actorUserId: string; workspaceId: string; userId: string; role: Exclude<Role, "owner"> },
): Promise<{ ok: true } | { ok: false; error: AccessFailure }> {
  const actor = await getWorkspaceForUser(db, input.actorUserId, input.workspaceId);
  if (!actor) return { ok: false, error: "not_found" };
  if (!hasRole(actor.role, "admin")) return { ok: false, error: "forbidden" };
  await db
    .insert(workspaceMemberships)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: input.role,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
  return { ok: true };
}

export async function getClientForMember(
  db: AppDatabase,
  input: { userId: string; workspaceId: string; clientId: string },
): Promise<{ id: string; name: string } | null> {
  assertWorkspaceId(input.workspaceId);
  const membership = await getWorkspaceForUser(db, input.userId, input.workspaceId);
  if (!membership) return null;
  const rows = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(
      and(
        eq(clients.workspaceId, input.workspaceId),
        eq(clients.id, input.clientId),
        isNull(clients.deletedAt),
      ),
    );
  return rows[0] ?? null;
}

export async function insertClient(
  db: AppDatabase,
  input: { userId: string; workspaceId: string; name: string; kind: "azienda" | "privato" },
): Promise<{ ok: true; id: string } | { ok: false; error: AccessFailure }> {
  const membership = await getWorkspaceForUser(db, input.userId, input.workspaceId);
  if (!membership) return { ok: false, error: "not_found" };
  if (!hasRole(membership.role, "member")) return { ok: false, error: "forbidden" };
  const id = createId();
  const now = new Date();
  await db.insert(clients).values({
    id,
    workspaceId: input.workspaceId,
    kind: input.kind,
    name: input.name,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  return { ok: true, id };
}

export type AccountWorkspace = WorkspaceSummary & { memberCount: number; logoAssetId: string | null };

export async function listAccountWorkspaces(db: AppDatabase, userId: string): Promise<AccountWorkspace[]> {
  const list = await listWorkspaces(db, userId);
  if (list.length === 0) return [];
  const ids = list.map((row) => row.id);
  const [counts, logos] = await Promise.all([
    db
      .select({ workspaceId: workspaceMemberships.workspaceId, total: sql<number>`count(*)` })
      .from(workspaceMemberships)
      .where(inArray(workspaceMemberships.workspaceId, ids))
      .groupBy(workspaceMemberships.workspaceId),
    db
      .select({ workspaceId: brandKits.workspaceId, logoAssetId: brandKits.logoAssetId })
      .from(brandKits)
      .where(inArray(brandKits.workspaceId, ids)),
  ]);
  const countBy = new Map(counts.map((row) => [row.workspaceId, Number(row.total)]));
  const logoBy = new Map(logos.map((row) => [row.workspaceId, row.logoAssetId]));
  return list.map((row) => ({ ...row, memberCount: countBy.get(row.id) ?? 1, logoAssetId: logoBy.get(row.id) ?? null }));
}

export type DeleteWorkspaceError = "not_found" | "forbidden" | "last_workspace" | "name_mismatch";

export const deleteWorkspaceMessages: Record<DeleteWorkspaceError, string> = {
  not_found: "Workspace non trovato.",
  forbidden: "Solo il proprietario può eliminare un workspace.",
  last_workspace: "Crea prima un altro workspace, poi puoi eliminare questo.",
  name_mismatch: "Scrivi il nome del workspace per confermare.",
};

/**
 * Permanently deletes a workspace the user owns, after they type its name. The last workspace
 * on the account cannot be removed. Related rows are deleted in one transaction so public
 * links and members disappear together. Logos live in the workspace database, not on Vercel Blob.
 * audit_logs is append-only and has no FK to workspaces, so those rows are kept.
 * quote_versions is also append-only: its no-delete trigger is dropped only inside the
 * transaction, then recreated, so published snapshots can be removed with the workspace.
 */
export async function deleteWorkspace(
  db: AppDatabase,
  input: { userId: string; workspaceId: string; confirmName: string },
): Promise<{ ok: true; nextWorkspaceId: string } | { ok: false; error: DeleteWorkspaceError }> {
  assertWorkspaceId(input.workspaceId);
  const list = await listWorkspaces(db, input.userId);
  const target = list.find((row) => row.id === input.workspaceId);
  if (!target) return { ok: false, error: "not_found" };
  if (target.role !== "owner") return { ok: false, error: "forbidden" };
  if (list.length < 2) return { ok: false, error: "last_workspace" };
  if (input.confirmName.trim() !== target.name) return { ok: false, error: "name_mismatch" };
  const next = list.find((row) => row.id !== target.id);
  if (!next) return { ok: false, error: "last_workspace" };

  const id = target.id;
  await db.transaction(async (tx) => {
    await tx.delete(quoteLineItems).where(eq(quoteLineItems.workspaceId, id));
    await tx.delete(quoteSections).where(eq(quoteSections.workspaceId, id));
    await tx.delete(quoteDrafts).where(eq(quoteDrafts.workspaceId, id));
    await tx.delete(quoteEvents).where(eq(quoteEvents.workspaceId, id));
    await tx.delete(quoteAcceptances).where(eq(quoteAcceptances.workspaceId, id));
    await tx.delete(quoteChangeRequests).where(eq(quoteChangeRequests.workspaceId, id));
    await tx.delete(quotePublicLinks).where(eq(quotePublicLinks.workspaceId, id));
    // Production (and the migrations) keep quote_versions append-only via a BEFORE DELETE
    // trigger. Drop it inside this transaction so the snapshots can go with the workspace;
    // a rollback restores the trigger.
    await tx.run(sql`drop trigger if exists quote_versions_no_delete`);
    await tx.delete(quoteVersions).where(eq(quoteVersions.workspaceId, id));
    await tx.run(sql`create trigger quote_versions_no_delete before delete on quote_versions begin
      select raise(abort, 'quote_versions e immutabile');
    end`);
    await tx.delete(quotes).where(eq(quotes.workspaceId, id));
    await tx.delete(clientContacts).where(eq(clientContacts.workspaceId, id));
    await tx.delete(clientNotes).where(eq(clientNotes.workspaceId, id));
    await tx.delete(clients).where(eq(clients.workspaceId, id));
    await tx.delete(catalogPackageItems).where(eq(catalogPackageItems.workspaceId, id));
    await tx.delete(catalogItems).where(eq(catalogItems.workspaceId, id));
    await tx.delete(catalogCategories).where(eq(catalogCategories.workspaceId, id));
    await tx.delete(templateFavorites).where(eq(templateFavorites.workspaceId, id));
    await tx.delete(templatePresets).where(eq(templatePresets.workspaceId, id));
    await tx.delete(brandKits).where(eq(brandKits.workspaceId, id));
    await tx.delete(assetBlobs).where(eq(assetBlobs.workspaceId, id));
    await tx.delete(assets).where(eq(assets.workspaceId, id));
    await tx.delete(quoteNumberSequences).where(eq(quoteNumberSequences.workspaceId, id));
    await tx.delete(workspaceSettings).where(eq(workspaceSettings.workspaceId, id));
    await tx.delete(usageCounters).where(eq(usageCounters.workspaceId, id));
    await tx.delete(subscriptionEvents).where(eq(subscriptionEvents.workspaceId, id));
    await tx.delete(subscriptions).where(eq(subscriptions.workspaceId, id));
    await tx.delete(emailDeliveries).where(eq(emailDeliveries.workspaceId, id));
    await tx.delete(outboxJobs).where(eq(outboxJobs.workspaceId, id));
    await tx.delete(notifications).where(eq(notifications.workspaceId, id));
    await tx.delete(notificationPrefs).where(eq(notificationPrefs.workspaceId, id));
    // audit_logs is append-only (BEFORE DELETE/UPDATE triggers). workspace_id has no FK,
    // so the rows stay as a record after the workspace is gone.
    await tx.delete(redeemCodeUses).where(eq(redeemCodeUses.workspaceId, id));
    await tx.delete(workspaceMemberships).where(eq(workspaceMemberships.workspaceId, id));
    await tx.delete(workspaces).where(eq(workspaces.id, id));
  });
  return { ok: true, nextWorkspaceId: next.id };
}
