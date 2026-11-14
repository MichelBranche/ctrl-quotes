import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { WorkspaceView } from "@/components/workspace/workspace-view";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/session";
import { listAccountWorkspaces } from "@/server/workspaces";

export const metadata = { title: "Workspace" };

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="pt-wait" aria-busy="true" />}>
      <WorkspaceContent />
    </Suspense>
  );
}

async function WorkspaceContent() {
  await connection();
  const session = await requireUser();
  const workspaces = await listAccountWorkspaces(getDb(), session.user.id);
  const requested = (await cookies()).get("cq_workspace")?.value;
  const current = workspaces.find((item) => item.id === requested) ?? workspaces[0];
  if (!current) return null;
  return (
    <WorkspaceView
      currentId={current.id}
      workspaces={workspaces.map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        role: item.role,
        plan: item.plan,
        planOverride: item.planOverride,
        memberCount: item.memberCount,
        logoAssetId: item.logoAssetId,
      }))}
    />
  );
}
