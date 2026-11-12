import "server-only";
import { connection } from "next/server";
import { can } from "@/domain/permissions";
import { requireContext } from "@/server/context";
import { getWorkspaceConfig } from "@/server/settings";

export async function loadSettings() {
  await connection();
  const { db, actor, workspace } = await requireContext();
  const config = await getWorkspaceConfig(db, actor);
  if (!config.ok) throw new Error(config.message);
  return { config: config.value, canEdit: can(workspace.role, "settings.write"), role: workspace.role, db, actor };
}
