import { Suspense } from "react";
import { FiscalForm } from "@/components/settings/fiscal-form";
import { Skeleton } from "@/components/ui/status";
import { loadSettings } from "@/app/app/settings/load";

export const metadata = { title: "Fiscale e IVA" };

export default function FiscalPage() {
  return (
    <Suspense fallback={<Skeleton width="40%" />}>
      <FiscalContent />
    </Suspense>
  );
}

async function FiscalContent() {
  const { config, canEdit } = await loadSettings();
  return <FiscalForm taxProfile={config.workspace.taxProfile} settings={config.settings} canEdit={canEdit} />;
}
