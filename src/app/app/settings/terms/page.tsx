import { Suspense } from "react";
import { TermsForm } from "@/components/settings/terms-form";
import { Skeleton } from "@/components/ui/status";
import { loadSettings } from "@/app/app/settings/load";

export const metadata = { title: "Condizioni" };

export default function TermsSettingsPage() {
  return (
    <Suspense fallback={<Skeleton width="40%" />}>
      <TermsContent />
    </Suspense>
  );
}

async function TermsContent() {
  const { config, canEdit } = await loadSettings();
  return <TermsForm terms={config.brand.defaultTerms} validityDays={config.settings.defaultValidityDays} canEdit={canEdit} />;
}
