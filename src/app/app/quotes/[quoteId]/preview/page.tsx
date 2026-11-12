import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft, Download } from "lucide-react";
import { QuoteDocumentView } from "@/components/quote-render/quote-document";
import { EmptyState, Skeleton, StatusBadge } from "@/components/ui/status";
import { logoSrc } from "@/domain/quote-snapshot";
import { requireContext } from "@/server/context";
import { getDraftSnapshot, getVersionSnapshot } from "@/server/quotes";

export const metadata = { title: "Anteprima preventivo" };

type Params = Promise<{ quoteId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export default function QuotePreviewPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton width="40%" />}>
      <PreviewContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const dateTime = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome" });

async function PreviewContent({ params, searchParams }: { params: Params; searchParams: Search }) {
  await connection();
  const { quoteId } = await params;
  const query = await searchParams;
  const raw = Array.isArray(query.v) ? query.v[0] : query.v;
  const versionNo = raw && /^\d{1,6}$/.test(raw) ? Number(raw) : null;
  const { db, actor } = await requireContext();
  const id = quoteId.slice(0, 64);
  const result = versionNo ? await getVersionSnapshot(db, actor, id, versionNo) : await getDraftSnapshot(db, actor, id);
  if (!result.ok) return <EmptyState title="Anteprima non disponibile" body={result.message} />;
  const snapshot = "snapshot" in result.value ? result.value.snapshot : result.value;
  const pdfHref = versionNo ? `/api/quotes/${id}/pdf?v=${versionNo}` : `/api/quotes/${id}/pdf`;
  return (
    <div className="preview-page">
      <header className="preview-bar">
        <Link className="btn btn-ghost back-link" href={`/app/quotes/${id}`}>
          <ArrowLeft size={16} aria-hidden="true" /> Torna all&apos;editor
        </Link>
        <div className="preview-title">
          <h1 className="preview-heading">{[snapshot.quote.number, snapshot.quote.title].filter(Boolean).join(" · ")}</h1>
          {"versionNo" in result.value ? (
            <span className="muted small">
              Versione {result.value.versionNo} del {dateTime.format(result.value.createdAt)} · impronta {result.value.sha256.slice(0, 12)}
            </span>
          ) : (
            <span className="muted small">Bozza attuale, non ancora congelata in una versione</span>
          )}
        </div>
        {versionNo ? <StatusBadge tone="success">Versione {versionNo}</StatusBadge> : <StatusBadge tone="draft">Bozza</StatusBadge>}
        <a className="btn btn-secondary" href={pdfHref} target="_blank" rel="noopener">
          <Download size={16} aria-hidden="true" /> PDF
        </a>
      </header>
      <div className="preview-paper">
        <QuoteDocumentView snapshot={snapshot} logoSrc={logoSrc(snapshot)} watermark={versionNo ? null : "Bozza"} versionLabel={versionNo ? `v${versionNo}` : null} layout="auto" />
      </div>
    </div>
  );
}
