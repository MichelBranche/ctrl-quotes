import "server-only";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { inviteTokenFromPath } from "@/domain/invite-path";
import { acceptInvite, acceptPendingInvitesForUser } from "@/server/invites";
import { listWorkspaces, type WorkspaceSummary } from "@/server/workspaces";

export function inviteWelcomePath(workspaceId: string): string {
  return `/onboarding/invito?w=${encodeURIComponent(workspaceId)}`;
}

/** An invited membership whose welcome tour has not been shown yet. */
export function needsInviteWelcome(workspace: Pick<WorkspaceSummary, "role" | "welcomedAt">): boolean {
  return workspace.role !== "owner" && workspace.welcomedAt == null;
}

/**
 * Where a signed-in user should go after login.
 * Invites first: the invite in the link/cookie, then any live invite for the user's email.
 * Invited members land on their short welcome tour, never on the brand onboarding.
 */
export async function pathAfterAuth(userId: string, inviteNext?: string | null): Promise<string> {
  const db = getDb();
  const token = inviteNext ? inviteTokenFromPath(inviteNext) : null;
  if (token && inviteNext) {
    const accepted = await acceptInvite(db, { userId, token });
    // Expired, revoked, used or meant for another email: the invite page explains which.
    if (!accepted.ok) return inviteNext;
  }
  await acceptPendingInvitesForUser(db, userId);

  const workspaces = await listWorkspaces(db, userId);
  if (workspaces.length === 0) return "/onboarding/trial";
  const toWelcome = workspaces.find(needsInviteWelcome);
  if (toWelcome) return inviteWelcomePath(toWelcome.id);
  const requested = (await cookies()).get("cq_workspace")?.value;
  const active = workspaces.find((item) => item.id === requested) ?? workspaces[0];
  if (!active.onboardingCompletedAt && active.role === "owner") return "/onboarding/setup";
  return "/app/overview";
}

export async function setupWorkspaceFor(userId: string) {
  const workspaces = await listWorkspaces(getDb(), userId);
  if (workspaces.length === 0) return null;
  const requested = (await cookies()).get("cq_workspace")?.value;
  const active = workspaces.find((item) => item.id === requested) ?? workspaces[0];
  if (active.onboardingCompletedAt || active.role !== "owner") return null;
  return active;
}
