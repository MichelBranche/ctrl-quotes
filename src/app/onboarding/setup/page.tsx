import { redirect } from "next/navigation";
import { SetupFlow } from "@/components/onboarding/setup-flow";
import { templateInfo, templateKeys } from "@/domain/templates";
import { listReusableBrandsAction } from "@/server/actions/onboarding";
import { pathAfterAuth, setupWorkspaceFor } from "@/server/onboarding-path";
import { requireUser } from "@/server/session";
import { defaultBrand, loadBrand } from "@/server/settings";
import { getDb } from "@/db/client";

export default async function SetupPage() {
  const session = await requireUser();
  const workspace = await setupWorkspaceFor(session.user.id);
  if (!workspace) redirect(await pathAfterAuth(session.user.id));
  const brand = await loadBrand(getDb(), workspace.id);
  const reusable = await listReusableBrandsAction();
  return (
    <SetupFlow
      step={Math.min(3, Math.max(0, workspace.onboardingStep))}
      workspaceName={workspace.name}
      brand={{
        companyName: brand.companyName ?? "",
        colorPrimary: brand.colorPrimary || defaultBrand.colorPrimary,
        hasLogo: Boolean(brand.logo),
        logoSrc: brand.logo ? `/api/assets/${brand.logo.assetId}` : null,
      }}
      reusable={reusable}
      templates={templateKeys.map((key) => ({
        key,
        name: templateInfo[key].name,
        description: templateInfo[key].description,
        accent: templateInfo[key].accent,
      }))}
    />
  );
}
