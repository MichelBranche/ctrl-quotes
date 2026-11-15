import { redirect } from "next/navigation";
import { TrialAcceptScreen } from "@/components/onboarding/trial-accept";
import { pathAfterAuth } from "@/server/onboarding-path";
import { requireUser } from "@/server/session";
import { listWorkspaces } from "@/server/workspaces";
import { getDb } from "@/db/client";

export default async function TrialPage() {
  const session = await requireUser();
  const workspaces = await listWorkspaces(getDb(), session.user.id);
  if (workspaces.some((item) => item.onboardingCompletedAt)) {
    redirect(await pathAfterAuth(session.user.id));
  }
  if (workspaces.some((item) => item.trialEndsAt && !item.onboardingCompletedAt)) {
    redirect("/onboarding/setup");
  }
  return <TrialAcceptScreen />;
}
