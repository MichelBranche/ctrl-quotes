import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/db/client";
import { subscriptions, user, workspaceInvitations, workspaceMemberships, workspaces } from "@/db/schema";
import { summaryPlanValue } from "@/domain/stripe-plans";
import { createId } from "@/domain/ids";
import { inviteRoleLabels, inviteRoles, type InviteRole, type PendingInvite, type SeatUsage } from "@/domain/invites";
import { currentPlanLabel, teamSeatLimitReachedMessage, teamSeatQuotaLabel, workspaceTeamSeatLimit } from "@/domain/plans";
import { invitePath } from "@/domain/invite-path";
import { resolvePublicBaseUrl } from "@/domain/public-url";
import { activePlanOverride } from "@/domain/redeem";
import { authorize, conflict, invalid, notFound, ok, type Actor, type Result } from "@/server/access";
import { writeAuditLog } from "@/server/audit";
import { INVITE_TTL_MS, renderInviteEmail } from "@/server/email/invite";
import { getEmailDriver } from "@/server/email";
import type { EmailMessage } from "@/server/email/types";
import { generateLinkToken, hashLinkToken, isWellFormedToken } from "@/server/link-token";
import { createRateLimiter, rateRules, type RateLimiter } from "@/server/rate-limit";

export const inviteRoleSchema = z.enum(inviteRoles);

export type InviteDeps = {
  now?: Date;
  origin?: string;
  send?: (message: EmailMessage) => Promise<void>;
  limiter?: RateLimiter;
};

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isInviteRole(value: string): value is InviteRole {
  return value === "admin" || value === "member";
}

export async function getSeatUsage(db: AppDatabase, workspaceId: string, now = new Date()): Promise<SeatUsage | null> {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace) return null;
  const override = activePlanOverride(workspace.planOverride, workspace.planOverrideUntil, now.getTime());
  const limit = workspaceTeamSeatLimit(workspace.plan, override);
  const [{ members }] = await db
    .select({ members: count() })
    .from(workspaceMemberships)
    .where(eq(workspaceMemberships.workspaceId, workspaceId));
  const pendingRows = await db
    .select({ expiresAt: workspaceInvitations.expiresAt })
    .from(workspaceInvitations)
    .where(and(eq(workspaceInvitations.workspaceId, workspaceId), eq(workspaceInvitations.status, "pending")));
  const pending = pendingRows.filter((row) => row.expiresAt.getTime() > now.getTime()).length;
  const used = members + pending;
  const [sub] = await db
    .select({ plan: subscriptions.plan, status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1);
  const planLabel = currentPlanLabel(summaryPlanValue(workspace.plan, sub), override);
  return {
    used,
    members,
    pending,
    limit,
    planLabel,
    quotaLabel: teamSeatQuotaLabel(used, limit),
  };
}

async function findMemberByEmail(db: AppDatabase, workspaceId: string, email: string) {
  const [row] = await db
    .select({ userId: user.id, email: user.email, role: workspaceMemberships.role })
    .from(workspaceMemberships)
    .innerJoin(user, eq(user.id, workspaceMemberships.userId))
    .where(and(eq(workspaceMemberships.workspaceId, workspaceId), eq(user.email, email)))
    .limit(1);
  return row ?? null;
}

async function findPendingInvite(db: AppDatabase, workspaceId: string, email: string) {
  const [row] = await db
    .select()
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.workspaceId, workspaceId),
        eq(workspaceInvitations.email, email),
        eq(workspaceInvitations.status, "pending"),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function sendInviteMessage(
  deps: InviteDeps | undefined,
  input: { email: string; url: string; workspaceName: string; inviterName: string; role: InviteRole },
): Promise<void> {
  const rendered = renderInviteEmail({
    url: input.url,
    workspaceName: input.workspaceName,
    inviterName: input.inviterName,
    role: input.role,
  });
  const message: EmailMessage = {
    to: input.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  };
  if (deps?.send) {
    await deps.send(message);
    return;
  }
  await getEmailDriver().send(message);
}

function inviteUrl(token: string, origin?: string): string {
  const base = origin ?? resolvePublicBaseUrl(process.env);
  return `${base}${invitePath(token)}`;
}

async function hitInviteLimits(
  db: AppDatabase,
  workspaceId: string,
  email: string,
  deps: InviteDeps | undefined,
  now: Date,
): Promise<Result<true>> {
  const limiter = deps?.limiter ?? createRateLimiter(db);
  const workspaceHit = await limiter.hit(rateRules.inviteSend, workspaceId, now.getTime());
  if (!workspaceHit.ok) {
    return invalid("Hai inviato troppi inviti in poco tempo. Riprova più tardi.");
  }
  const emailHit = await limiter.hit(rateRules.inviteEmail, `${workspaceId}:${email}`, now.getTime());
  if (!emailHit.ok) {
    return invalid("Hai già inviato troppi inviti a questa email oggi. Riprova domani.");
  }
  return ok(true);
}

export async function createWorkspaceInvite(
  db: AppDatabase,
  actor: Actor,
  input: { email: string; role: InviteRole },
  deps?: InviteDeps,
): Promise<Result<{ id: string; email: string; expiresAt: Date }>> {
  const allowed = await authorize(db, actor, "team.invite");
  if (!allowed.ok) return allowed;
  if (input.role === "admin" && allowed.value.role !== "owner") {
    return invalid("Solo il titolare può invitare un amministratore.");
  }

  const email = normalizeInviteEmail(input.email);
  if (!z.email().safeParse(email).success) return invalid("Inserisci un'email valida.");

  const [actorUser] = await db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, actor.userId)).limit(1);
  if (actorUser && normalizeInviteEmail(actorUser.email) === email) {
    return invalid("Non puoi invitare te stesso.");
  }

  const now = deps?.now ?? new Date();
  const existingMember = await findMemberByEmail(db, actor.workspaceId, email);
  if (existingMember) return conflict("Questa email è già membro del workspace.");

  const pending = await findPendingInvite(db, actor.workspaceId, email);
  if (pending && pending.expiresAt.getTime() > now.getTime()) {
    return conflict("C'è già un invito in attesa per questa email. Puoi inviarlo di nuovo.");
  }

  const seats = await getSeatUsage(db, actor.workspaceId, now);
  if (!seats) return notFound("Workspace non trovato.");
  if (seats.limit != null && seats.used >= seats.limit) {
    return invalid(teamSeatLimitReachedMessage(seats.planLabel, seats.limit));
  }

  const limited = await hitInviteLimits(db, actor.workspaceId, email, deps, now);
  if (!limited.ok) return limited;

  const token = generateLinkToken();
  const id = createId();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);

  if (pending) {
    await db
      .update(workspaceInvitations)
      .set({
        role: input.role,
        tokenHash: hashLinkToken(token),
        invitedByUserId: actor.userId,
        status: "pending",
        expiresAt,
        acceptedAt: null,
        acceptedByUserId: null,
        updatedAt: now,
      })
      .where(eq(workspaceInvitations.id, pending.id));
  } else {
    await db.insert(workspaceInvitations).values({
      id,
      workspaceId: actor.workspaceId,
      email,
      role: input.role,
      tokenHash: hashLinkToken(token),
      invitedByUserId: actor.userId,
      status: "pending",
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
  }

  const inviteId = pending?.id ?? id;
  await writeAuditLog(db, {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action: "invite.created",
    entityType: "invitation",
    entityId: inviteId,
    meta: { email, role: input.role },
  });

  await sendInviteMessage(deps, {
    email,
    url: inviteUrl(token, deps?.origin),
    workspaceName: allowed.value.name,
    inviterName: actorUser?.name ?? "Un membro del team",
    role: input.role,
  });

  return ok({ id: inviteId, email, expiresAt });
}

export async function resendWorkspaceInvite(
  db: AppDatabase,
  actor: Actor,
  inviteId: string,
  deps?: InviteDeps,
): Promise<Result<{ id: string; expiresAt: Date }>> {
  const allowed = await authorize(db, actor, "team.invite");
  if (!allowed.ok) return allowed;

  const [invite] = await db
    .select()
    .from(workspaceInvitations)
    .where(and(eq(workspaceInvitations.id, inviteId), eq(workspaceInvitations.workspaceId, actor.workspaceId)))
    .limit(1);
  if (!invite) return notFound("Invito non trovato.");
  if (invite.status === "accepted") return conflict("Questo invito è già stato accettato.");
  if (invite.status === "revoked") return conflict("Questo invito è stato revocato. Inviane uno nuovo.");
  if (invite.role === "admin" && allowed.value.role !== "owner") {
    return invalid("Solo il titolare può reinviare un invito da amministratore.");
  }

  const now = deps?.now ?? new Date();
  const limited = await hitInviteLimits(db, actor.workspaceId, invite.email, deps, now);
  if (!limited.ok) return limited;

  const token = generateLinkToken();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  await db
    .update(workspaceInvitations)
    .set({ tokenHash: hashLinkToken(token), expiresAt, invitedByUserId: actor.userId, updatedAt: now })
    .where(eq(workspaceInvitations.id, invite.id));

  await writeAuditLog(db, {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action: "invite.resent",
    entityType: "invitation",
    entityId: invite.id,
    meta: { email: invite.email, role: invite.role },
  });

  const [actorUser] = await db.select({ name: user.name }).from(user).where(eq(user.id, actor.userId)).limit(1);
  if (!isInviteRole(invite.role)) return invalid("Ruolo dell'invito non valido.");
  await sendInviteMessage(deps, {
    email: invite.email,
    url: inviteUrl(token, deps?.origin),
    workspaceName: allowed.value.name,
    inviterName: actorUser?.name ?? "Un membro del team",
    role: invite.role,
  });

  return ok({ id: invite.id, expiresAt });
}

export async function revokeWorkspaceInvite(
  db: AppDatabase,
  actor: Actor,
  inviteId: string,
  now = new Date(),
): Promise<Result<{ id: string }>> {
  const allowed = await authorize(db, actor, "team.invite");
  if (!allowed.ok) return allowed;

  const [invite] = await db
    .select()
    .from(workspaceInvitations)
    .where(and(eq(workspaceInvitations.id, inviteId), eq(workspaceInvitations.workspaceId, actor.workspaceId)))
    .limit(1);
  if (!invite) return notFound("Invito non trovato.");
  if (invite.status !== "pending") return conflict("Questo invito non è più in attesa.");

  await db
    .update(workspaceInvitations)
    .set({ status: "revoked", updatedAt: now })
    .where(eq(workspaceInvitations.id, invite.id));

  await writeAuditLog(db, {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action: "invite.revoked",
    entityType: "invitation",
    entityId: invite.id,
    meta: { email: invite.email },
  });

  return ok({ id: invite.id });
}

export async function listPendingInvites(db: AppDatabase, actor: Actor, now = new Date()): Promise<Result<PendingInvite[]>> {
  const allowed = await authorize(db, actor, "team.read");
  if (!allowed.ok) return allowed;

  const rows = await db
    .select({
      id: workspaceInvitations.id,
      email: workspaceInvitations.email,
      role: workspaceInvitations.role,
      invitedByName: user.name,
      createdAt: workspaceInvitations.createdAt,
      expiresAt: workspaceInvitations.expiresAt,
    })
    .from(workspaceInvitations)
    .innerJoin(user, eq(user.id, workspaceInvitations.invitedByUserId))
    .where(and(eq(workspaceInvitations.workspaceId, actor.workspaceId), eq(workspaceInvitations.status, "pending")))
    .orderBy(desc(workspaceInvitations.createdAt));

  return ok(
    rows
      .filter((row): row is typeof row & { role: InviteRole } => isInviteRole(row.role))
      .map((row) => ({
        ...row,
        expired: row.expiresAt.getTime() <= now.getTime(),
      })),
  );
}

export type InvitePreview = {
  workspaceName: string;
  role: InviteRole;
  roleLabel: string;
  inviterName: string;
  email: string;
  expiresAt: Date;
  status: "pending" | "accepted" | "revoked" | "expired";
};

export async function previewInvite(db: AppDatabase, token: string, now = new Date()): Promise<InvitePreview | null> {
  if (!isWellFormedToken(token)) return null;
  const [row] = await db
    .select({
      email: workspaceInvitations.email,
      role: workspaceInvitations.role,
      status: workspaceInvitations.status,
      expiresAt: workspaceInvitations.expiresAt,
      workspaceName: workspaces.name,
      inviterName: user.name,
    })
    .from(workspaceInvitations)
    .innerJoin(workspaces, eq(workspaces.id, workspaceInvitations.workspaceId))
    .innerJoin(user, eq(user.id, workspaceInvitations.invitedByUserId))
    .where(eq(workspaceInvitations.tokenHash, hashLinkToken(token)))
    .limit(1);
  if (!row || !isInviteRole(row.role)) return null;
  const status =
    row.status === "pending" && row.expiresAt.getTime() <= now.getTime()
      ? "expired"
      : row.status === "accepted" || row.status === "revoked" || row.status === "pending"
        ? row.status
        : "expired";
  return {
    workspaceName: row.workspaceName,
    role: row.role,
    roleLabel: inviteRoleLabels[row.role],
    inviterName: row.inviterName,
    email: row.email,
    expiresAt: row.expiresAt,
    status,
  };
}

export async function acceptInvite(
  db: AppDatabase,
  input: { userId: string; token: string },
  now = new Date(),
): Promise<Result<{ workspaceId: string; workspaceName: string; alreadyMember: boolean }>> {
  if (!isWellFormedToken(input.token)) return invalid("Invito non valido o scaduto.");

  const [invite] = await db
    .select()
    .from(workspaceInvitations)
    .where(eq(workspaceInvitations.tokenHash, hashLinkToken(input.token)))
    .limit(1);
  if (!invite) return invalid("Invito non valido o scaduto.");
  if (invite.status === "revoked") return conflict("Questo invito è stato revocato.");
  if (invite.status === "accepted") {
    if (invite.acceptedByUserId === input.userId) {
      const [workspace] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, invite.workspaceId)).limit(1);
      return ok({ workspaceId: invite.workspaceId, workspaceName: workspace?.name ?? "Workspace", alreadyMember: true });
    }
    return conflict("Questo invito è già stato usato.");
  }
  if (invite.expiresAt.getTime() <= now.getTime()) return invalid("Questo invito è scaduto. Chiedi un nuovo invito.");
  if (!isInviteRole(invite.role)) return invalid("Invito non valido o scaduto.");

  const [actorUser] = await db.select({ email: user.email }).from(user).where(eq(user.id, input.userId)).limit(1);
  if (!actorUser) return notFound("Account non trovato.");
  if (normalizeInviteEmail(actorUser.email) !== invite.email) {
    return invalid(`Questo invito è per ${invite.email}. Accedi con quella email per accettarlo.`);
  }

  const existing = await db
    .select({ userId: workspaceMemberships.userId })
    .from(workspaceMemberships)
    .where(and(eq(workspaceMemberships.workspaceId, invite.workspaceId), eq(workspaceMemberships.userId, input.userId)))
    .limit(1);
  if (existing[0]) {
    await db
      .update(workspaceInvitations)
      .set({ status: "accepted", acceptedAt: now, acceptedByUserId: input.userId, updatedAt: now })
      .where(eq(workspaceInvitations.id, invite.id));
    const [workspace] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, invite.workspaceId)).limit(1);
    return ok({ workspaceId: invite.workspaceId, workspaceName: workspace?.name ?? "Workspace", alreadyMember: true });
  }

  const seats = await getSeatUsage(db, invite.workspaceId, now);
  if (!seats) return notFound("Workspace non trovato.");
  // The pending invite already counts as a used seat; joining replaces it.
  const usedWithoutThis = seats.used - 1;
  if (seats.limit != null && usedWithoutThis >= seats.limit) {
    return invalid(teamSeatLimitReachedMessage(seats.planLabel, seats.limit));
  }

  await db.insert(workspaceMemberships).values({
    workspaceId: invite.workspaceId,
    userId: input.userId,
    role: invite.role,
    createdAt: now,
  });
  await db
    .update(workspaceInvitations)
    .set({ status: "accepted", acceptedAt: now, acceptedByUserId: input.userId, updatedAt: now })
    .where(eq(workspaceInvitations.id, invite.id));

  await writeAuditLog(db, {
    workspaceId: invite.workspaceId,
    actorUserId: input.userId,
    action: "invite.accepted",
    entityType: "invitation",
    entityId: invite.id,
    meta: { email: invite.email, role: invite.role },
  });

  const [workspace] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, invite.workspaceId)).limit(1);
  return ok({ workspaceId: invite.workspaceId, workspaceName: workspace?.name ?? "Workspace", alreadyMember: false });
}

export type { PendingInvite, SeatUsage } from "@/domain/invites";
