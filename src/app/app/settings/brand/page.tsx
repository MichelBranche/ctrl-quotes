import { Suspense } from "react";
import { BrandKitForm } from "@/components/settings/brand-form";
import { Skeleton } from "@/components/ui/status";
import { loadSettings } from "@/app/app/settings/load";
import { listTemplates } from "@/server/templates";

export const metadata = { title: "Brand Kit" };

export default function BrandPage() {
  return (
    <Suspense fallback={<Skeleton width="40%" />}>
      <BrandContent />
    </Suspense>
  );
}

async function BrandContent() {
  const { config, canEdit, db, actor } = await loadSettings();
  const templates = await listTemplates(db, actor);
  const defaultTemplate = templates.ok ? (templates.value.find((template) => template.isDefault) ?? null) : null;
  return (
    <BrandKitForm
      brand={config.brand}
      workspaceName={config.workspace.name}
      canEdit={canEdit}
      templateKey={defaultTemplate?.key ?? "minimal"}
      templateName={defaultTemplate?.name ?? "Minimal"}
    />
  );
}
