import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { ProfileForm } from "@/components/settings/profile-form";
import { hasRole } from "@/domain/roles";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/session";
import { listWorkspaces } from "@/server/workspaces";

export const metadata = { title: "Profilo workspace" };

export default function SettingsProfilePage() {
  return (
    <Suspense fallback={<div className="pt-wait" aria-busy="true" />}>
      <SettingsContent />
    </Suspense>
  );
}

async function SettingsContent() {
  await connection();
  const session = await requireUser();
  const workspaces = await listWorkspaces(getDb(), session.user.id);
  const requested = (await cookies()).get("cq_workspace")?.value;
  const workspace = workspaces.find((item) => item.id === requested) ?? workspaces[0];
  if (!workspace) return null;
  return (
    <ProfileForm workspaceId={workspace.id} workspaceName={workspace.name} workspaceSlug={workspace.slug} canEdit={hasRole(workspace.role, "admin")} />
  );
}
