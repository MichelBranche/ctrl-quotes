import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, type AppDatabase } from "@/db/client";
import type { Actor } from "@/server/access";
import { requireUser } from "@/server/session";
import { listWorkspaces, type WorkspaceSummary } from "@/server/workspaces";

export type Context = { db: AppDatabase; actor: Actor; workspace: WorkspaceSummary; userName: string };

/** Session user plus the workspace chosen in the switcher. Membership is re-checked by every domain call. */
export async function requireContext(): Promise<Context> {
  const session = await requireUser();
  const db = getDb();
  const workspaces = await listWorkspaces(db, session.user.id);
  const requested = (await cookies()).get("cq_workspace")?.value;
  const workspace = workspaces.find((item) => item.id === requested) ?? workspaces[0];
  if (!workspace) redirect("/onboarding");
  return { db, actor: { userId: session.user.id, workspaceId: workspace.id }, workspace, userName: session.user.name };
}
