import { Suspense } from "react";
import { connection } from "next/server";
import { QuoteWizard } from "@/components/quotes/quote-wizard";
import { can } from "@/domain/permissions";
import { requireContext } from "@/server/context";
import { listClientOptions, listQuotableItems } from "@/server/quotes";
import { getWorkspaceConfig } from "@/server/settings";
import { listTemplates } from "@/server/templates";

export const metadata = { title: "Nuovo preventivo" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function NewQuotePage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<div className="pt-wait" aria-busy="true" />}>
      <NewQuoteContent searchParams={searchParams} />
    </Suspense>
  );
}

async function NewQuoteContent({ searchParams }: { searchParams: Search }) {
  await connection();
  const params = await searchParams;
  const { db, actor, workspace } = await requireContext();
  const [clients, items, templates, config] = await Promise.all([
    listClientOptions(db, actor),
    listQuotableItems(db, actor),
    listTemplates(db, actor),
    getWorkspaceConfig(db, actor),
  ]);
  if (!clients.ok || !items.ok || !templates.ok || !config.ok) throw new Error("Dati del workspace non disponibili.");
  const clientParam = Array.isArray(params.client) ? params.client[0] : params.client;
  const preselected = clients.value.find((client) => client.id === clientParam)?.id ?? null;
  return (
    <QuoteWizard
      clients={clients.value}
      items={items.value}
      templates={templates.value}
      preselectedClientId={preselected}
      defaults={{
        validityDays: config.value.settings.defaultValidityDays,
        taxProfile: workspace.taxProfile,
        stampDutyNote: config.value.settings.stampDutyNote,
      }}
      brand={{
        companyName: config.value.brand.companyName ?? workspace.name,
        logoUrl: config.value.brand.logo ? `/api/assets/${config.value.brand.logo.assetId}` : null,
      }}
      canWrite={can(workspace.role, "quotes.write")}
    />
  );
}
