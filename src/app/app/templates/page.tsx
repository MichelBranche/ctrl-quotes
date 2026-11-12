import { Suspense } from "react";
import { connection } from "next/server";
import { TemplatesView } from "@/components/templates/templates-view";
import { Skeleton } from "@/components/ui/status";
import { can } from "@/domain/permissions";
import { requireContext } from "@/server/context";
import { getWorkspaceConfig } from "@/server/settings";
import { listTemplates } from "@/server/templates";

export const metadata = { title: "Template" };

type Search = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function TemplatesPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton width="40%" />}>
      <TemplatesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function TemplatesContent({ searchParams }: { searchParams: Search }) {
  await connection();
  const params = await searchParams;
  const { db, actor, workspace } = await requireContext();
  const [templates, config] = await Promise.all([listTemplates(db, actor), getWorkspaceConfig(db, actor)]);
  if (!templates.ok || !config.ok) throw new Error("Template non disponibili.");
  return (
    <TemplatesView
      templates={templates.value}
      view={one(params.view) === "favorites" ? "favorites" : "all"}
      selectedKey={one(params.t) ?? null}
      brand={{
        companyName: config.value.brand.companyName ?? workspace.name,
        logoUrl: config.value.brand.logo ? `/api/assets/${config.value.brand.logo.assetId}` : null,
      }}
      permissions={{
        favorite: can(workspace.role, "templates.favorite"),
        setDefault: can(workspace.role, "templates.default"),
      }}
    />
  );
}
