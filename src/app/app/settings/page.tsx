import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { ProfileForm } from "@/components/settings/profile-form";
import { PageHeader, Skeleton } from "@/components/ui/status";
import { hasRole } from "@/domain/roles";
import { messages } from "@/i18n/it";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/session";
import { listWorkspaces } from "@/server/workspaces";

export const metadata = { title: "Impostazioni" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<Skeleton width="40%" />}>
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
    <>
      <PageHeader title={messages.settings.title} subtitle={messages.settings.subtitle} />
      <ProfileForm
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        canEdit={hasRole(workspace.role, "admin")}
      />
    </>
  );
}
