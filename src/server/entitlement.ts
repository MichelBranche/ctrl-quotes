import "server-only";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { subscriptions } from "@/db/schema";
import { workspaceEntitlement, type WorkspaceEntitlement } from "@/domain/entitlement";
import type { WorkspaceSummary } from "@/server/workspaces";

export async function loadWorkspaceEntitlement(
  db: AppDatabase,
  workspace: WorkspaceSummary,
  now = new Date(),
): Promise<WorkspaceEntitlement> {
  const [sub] = await db
    .select({ status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspace.id))
    .limit(1);
  return workspaceEntitlement(
    {
      plan: workspace.plan,
      planOverride: workspace.planOverride,
      planOverrideUntil: workspace.planOverrideUntil,
      trialEndsAt: workspace.trialEndsAt,
      subscriptionStatus: sub?.status ?? null,
    },
    now,
  );
}
