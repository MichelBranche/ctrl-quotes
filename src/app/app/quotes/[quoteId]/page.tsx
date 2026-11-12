import { Suspense } from "react";
import { connection } from "next/server";
import { QuoteEditor } from "@/components/quote-editor/quote-editor";
import { EmptyState, Skeleton } from "@/components/ui/status";
import { requireContext } from "@/server/context";
import { editorVisualeEnabled } from "@/server/flags";
import { getQuoteEditor, listClientOptions, listQuotableItems } from "@/server/quotes";
import { getWorkspaceConfig } from "@/server/settings";
import { listTemplates } from "@/server/templates";

export const metadata = { title: "Editor preventivo" };

type Params = Promise<{ quoteId: string }>;

export default function QuoteEditorPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <EditorContent params={params} />
    </Suspense>
  );
}

async function EditorContent({ params }: { params: Params }) {
  await connection();
  const { quoteId } = await params;
  const { db, actor } = await requireContext();
  const editor = await getQuoteEditor(db, actor, quoteId.slice(0, 64));
  if (!editor.ok) {
    return <EmptyState title="Preventivo non disponibile" body="Il preventivo non esiste, è stato eliminato o appartiene a un altro workspace." />;
  }
  const [clients, items, templates, config] = await Promise.all([
    listClientOptions(db, actor),
    listQuotableItems(db, actor),
    listTemplates(db, actor),
    getWorkspaceConfig(db, actor),
  ]);
  if (!clients.ok || !items.ok || !templates.ok || !config.ok) throw new Error("Dati del workspace non disponibili.");
  return (
    <QuoteEditor
      key={`${editor.value.quote.id}:${editor.value.revision}`}
      data={editor.value}
      clients={clients.value}
      items={items.value}
      templates={templates.value}
      defaults={{ taxRateBp: config.value.settings.defaultTaxRateBp, priceMode: config.value.settings.defaultPriceMode }}
      logoUrl={config.value.brand.logo ? `/api/assets/${config.value.brand.logo.assetId}` : null}
      visuale={editorVisualeEnabled()}
    />
  );
}

function EditorSkeleton() {
  return (
    <div className="stack" aria-busy="true">
      <Skeleton width="40%" />
      <Skeleton width="70%" />
      <Skeleton />
    </div>
  );
}
