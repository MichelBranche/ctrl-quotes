import { redirect } from "next/navigation";
import { NewWorkspaceForm } from "@/components/onboarding/new-workspace-form";
import { requireUser } from "@/server/session";
import { listWorkspaces } from "@/server/workspaces";
import { getDb } from "@/db/client";

export default async function OnboardingPage() {
  const session = await requireUser();
  const workspaces = await listWorkspaces(getDb(), session.user.id);
  if (workspaces.length === 0) redirect("/onboarding/trial");
  return <NewWorkspaceForm />;
}
