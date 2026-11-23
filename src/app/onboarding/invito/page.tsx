import { redirect } from "next/navigation";
import { InviteWelcomeFlow } from "@/components/onboarding/invite-welcome";
import { getDb } from "@/db/client";
import { getInviteWelcome } from "@/server/invites";
import { requireUser } from "@/server/session";

export const metadata = {
  title: "Benvenuto nel team",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ w?: string | string[] }>;

/** Short tour for invited members: no brand setup, it ends in the invited workspace. */
export default async function InviteWelcomePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireUser();
  const raw = (await searchParams).w;
  const workspaceId = typeof raw === "string" ? raw : "";
  const welcome = workspaceId ? await getInviteWelcome(getDb(), session.user.id, workspaceId) : null;
  if (!welcome || welcome.welcomed) redirect("/app/overview");
  return (
    <InviteWelcomeFlow
      workspaceId={welcome.workspaceId}
      workspaceName={welcome.workspaceName}
      inviterName={welcome.inviterName}
      role={welcome.role}
      roleLabel={welcome.roleLabel}
      userName={session.user.name}
    />
  );
}
