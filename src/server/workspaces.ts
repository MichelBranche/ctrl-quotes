import { and, eq, isNull } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { clients, workspaceMemberships, workspaces } from "@/db/schema";
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

async function uniqueSlug(db: AppDatabase, name: string): Promise<string> {
  const base = slugify(name);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${createId().slice(0, 6)}`;
    const existing = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, slug));
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
  input: { userId: string; workspaceId: string; name: string },
): Promise<{ ok: true; workspace: WorkspaceSummary } | { ok: false; error: AccessFailure }> {
  const current = await getWorkspaceForUser(db, input.userId, input.workspaceId);
  if (!current) return { ok: false, error: "not_found" };
  if (!hasRole(current.role, "admin")) return { ok: false, error: "forbidden" };
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) {
    throw new Error("Il nome del workspace deve avere tra 2 e 80 caratteri.");
  }
  await db
    .update(workspaces)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(workspaces.id, input.workspaceId), isNull(workspaces.deletedAt)));
  return { ok: true, workspace: { ...current, name } };
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
