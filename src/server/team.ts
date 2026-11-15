import { and, asc, count, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { user, workspaceMemberships } from "@/db/schema";
import { can } from "@/domain/permissions";
import { isRole, type Role } from "@/domain/roles";
import { authorize, conflict, invalid, notFound, ok, type Actor, type Result } from "@/server/access";
import { writeAuditLog } from "@/server/audit";

export type Member = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: Date;
  isSelf: boolean;
  canChangeRole: boolean;
  canRemove: boolean;
};

export async function listMembers(db: AppDatabase, actor: Actor): Promise<Result<{ members: Member[]; myRole: Role }>> {
  const access = await authorize(db, actor, "team.read");
  if (!access.ok) return access;
  const myRole = access.value.role;
  const rows = await db
    .select({
      userId: workspaceMemberships.userId,
      role: workspaceMemberships.role,
      joinedAt: workspaceMemberships.createdAt,
      name: user.name,
      email: user.email,
    })
    .from(workspaceMemberships)
    .innerJoin(user, eq(user.id, workspaceMemberships.userId))
    .where(eq(workspaceMemberships.workspaceId, actor.workspaceId))
    .orderBy(asc(workspaceMemberships.createdAt));
  const members = rows.flatMap((row) => {
    if (!isRole(row.role)) return [];
    const isSelf = row.userId === actor.userId;
    const role = row.role;
    return [
      {
        ...row,
        role,
        isSelf,
        canChangeRole: !isSelf && role !== "owner" && can(myRole, "team.role"),
        canRemove: !isSelf && role !== "owner" && can(myRole, "team.remove") && (myRole === "owner" || role === "member"),
      },
    ];
  });
  return ok({ members, myRole });
}

async function membership(db: AppDatabase, workspaceId: string, userId: string) {
  const rows = await db
    .select({ role: workspaceMemberships.role })
    .from(workspaceMemberships)
    .where(and(eq(workspaceMemberships.workspaceId, workspaceId), eq(workspaceMemberships.userId, userId)));
  const role = rows[0]?.role;
  return role && isRole(role) ? role : null;
}

export async function changeMemberRole(
  db: AppDatabase,
  actor: Actor,
  targetUserId: string,
  role: unknown,
): Promise<Result<null>> {
  const access = await authorize(db, actor, "team.role");
  if (!access.ok) return access;
  if (role !== "admin" && role !== "member") return invalid("Ruolo non valido. Puoi assegnare Amministratore o Membro.");
  if (targetUserId === actor.userId) return conflict("Non puoi cambiare il tuo ruolo.");
  const current = await membership(db, actor.workspaceId, targetUserId);
  if (!current) return notFound("Membro non trovato.");
  if (current === "owner") return conflict("Il ruolo del proprietario non si può cambiare da qui.");
  await db
    .update(workspaceMemberships)
    .set({ role })
    .where(and(eq(workspaceMemberships.workspaceId, actor.workspaceId), eq(workspaceMemberships.userId, targetUserId)));
  await writeAuditLog(db, {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action: "member.role_changed",
    entityType: "membership",
    entityId: targetUserId,
    meta: { role },
  });
  return ok(null);
}

export async function removeMember(db: AppDatabase, actor: Actor, targetUserId: string): Promise<Result<null>> {
  const access = await authorize(db, actor, "team.remove");
  if (!access.ok) return access;
  if (targetUserId === actor.userId) return conflict("Non puoi rimuovere te stesso dal workspace.");
  const current = await membership(db, actor.workspaceId, targetUserId);
  if (!current) return notFound("Membro non trovato.");
  if (current === "owner") {
    const [{ owners }] = await db
      .select({ owners: count() })
      .from(workspaceMemberships)
      .where(and(eq(workspaceMemberships.workspaceId, actor.workspaceId), eq(workspaceMemberships.role, "owner")));
    if (owners <= 1) return conflict("Non puoi rimuovere l'unico titolare del workspace.");
    return conflict("Il proprietario non può essere rimosso.");
  }
  if (current === "admin" && access.value.role !== "owner") {
    return { ok: false, error: "forbidden", message: "Solo il proprietario può rimuovere un amministratore." };
  }
  await db
    .delete(workspaceMemberships)
    .where(and(eq(workspaceMemberships.workspaceId, actor.workspaceId), eq(workspaceMemberships.userId, targetUserId)));
  await writeAuditLog(db, {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action: "member.removed",
    entityType: "membership",
    entityId: targetUserId,
  });
  return ok(null);
}
