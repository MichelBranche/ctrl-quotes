import "server-only";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { listWorkspaces } from "@/server/workspaces";

/** Where a signed-in user should go after login, or null to stay on the requested app path. */
export async function pathAfterAuth(userId: string, inviteNext?: string | null): Promise<string> {
  if (inviteNext) return inviteNext;
  const workspaces = await listWorkspaces(getDb(), userId);
  if (workspaces.length === 0) return "/onboarding/trial";
  const requested = (await cookies()).get("cq_workspace")?.value;
  const active = workspaces.find((item) => item.id === requested) ?? workspaces[0];
  if (!active.onboardingCompletedAt) return "/onboarding/setup";
  return "/app/overview";
}

export async function setupWorkspaceFor(userId: string) {
  const workspaces = await listWorkspaces(getDb(), userId);
  if (workspaces.length === 0) return null;
  const requested = (await cookies()).get("cq_workspace")?.value;
  const active = workspaces.find((item) => item.id === requested) ?? workspaces[0];
  if (active.onboardingCompletedAt) return null;
  return active;
}
