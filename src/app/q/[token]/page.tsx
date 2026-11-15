import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Clock, Download, Lock, Mail } from "lucide-react";
import { PublicDecisionForm } from "@/components/public-quote/decision-form";
import { PublicPaymentSection } from "@/components/public-quote/payment-section";
import { QuoteDocumentView } from "@/components/quote-render/quote-document";
import { ensureMigrated, getDb } from "@/db/client";
import { headlineTotal, logoSrc } from "@/domain/quote-snapshot";
import { loadQuotePaymentForPublic } from "@/server/payments";
import { loadPublicQuote, type PublicQuoteView } from "@/server/public-quote";
import { clientIp } from "@/server/request-meta";
import { LegalLinks } from "@/components/legal/legal-links";
import { ViewBeacon } from "./view-beacon";

export const metadata: Metadata = {
  title: "Preventivo",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

type Params = Promise<{ token: string }>;

const longDate = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });

export default function PublicQuotePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="pq" aria-busy="true" />}>
      <PublicQuoteContent params={params} />
    </Suspense>
  );
}

async function PublicQuoteContent({ params }: { params: Params }) {
  await connection();
  const { token } = await params;
  await ensureMigrated();
  const view = await loadPublicQuote(getDb(), token, clientIp(await headers()));
  if (view.kind !== "active") return <StatePage view={view} />;

  const { snapshot, versionNo } = view;
  const clean = token.slice(0, 64);
  const pdfHref = `/q/${clean}/pdf`;
  const validUntil = snapshot.quote.validUntil ? new Date(snapshot.quote.validUntil) : null;
  const daysLeft = view.daysLeft;
  const accepted = view.status === "accepted";
  const total = headlineTotal(snapshot.totals);
  const payment = await loadQuotePaymentForPublic(getDb(), view.workspaceId, view.quoteId, accepted);
  const contactFirst = view.contactName?.trim().split(/\s+/)[0] ?? null;
  const subtitle = [snapshot.client ? `Per ${snapshot.client.name}` : null, `versione ${versionNo}${view.sentAt ? ` del ${longDate.format(view.sentAt)}` : ""}`].filter(Boolean).join(" · ");

  return (
    <div className="pq">
      <ViewBeacon token={clean} />
      <header className="pq-top">
        <span className="pq-brand">
          <i aria-hidden="true">{(view.studioName.trim()[0] ?? "S").toUpperCase()}</i>
          <span>{view.studioName}</span>
        </span>
        <div className="pq-who">
          <strong>{["Preventivo", snapshot.quote.number].filter(Boolean).join(" ")} · {snapshot.quote.title}</strong>
          <span>{subtitle}</span>
        </div>
        <div className="pq-top-end">
          {accepted ? (
            <span className="pq-pill"><span className="pq-dot" aria-hidden="true" />Accettato</span>
          ) : daysLeft !== null ? (
            <span className="pq-pill"><span className="pq-dot" aria-hidden="true" />{daysLeft === 0 ? "Scade oggi" : <><span className="pq-hide-sm">Valido ancora </span>{daysLeft} {daysLeft === 1 ? "giorno" : "giorni"}</>}</span>
          ) : null}
          <a className="pq-btn light" href={pdfHref} download>
            <Download size={16} aria-hidden="true" /> <span className="pq-hide-sm">Scarica PDF</span>
          </a>
        </div>
      </header>

      {versionNo > 1 && view.sentAt ? (
        <p className="pq-updated" role="status">
          Aggiornato il {longDate.format(view.sentAt)}: stai vedendo la versione {versionNo}.
        </p>
      ) : null}

      <main className="pq-main">
        <div className="pq-doc">
          <div className="preview-paper">
            <QuoteDocumentView snapshot={snapshot} assetBase={`/q/${clean}/img/`} logoSrc={logoSrc(snapshot)} watermark={null} versionLabel={`v${versionNo}`} layout="auto" />
          </div>
        </div>

        <aside className="pq-aside" aria-label="Riepilogo">
          <section className="pq-card">
            <span className="pq-eyebrow">Totale del preventivo</span>
            <p className="pq-total">
              {total} <small>IVA inclusa</small>
            </p>
            <dl className="pq-facts">
              {view.contactName ? (
                <div><dt>Preparato da</dt><dd>{view.contactName}</dd></div>
              ) : null}
              <div><dt>Data</dt><dd>{longDate.format(new Date(snapshot.quote.issuedAt))}</dd></div>
              {validUntil ? (
                <div><dt>Valido fino al</dt><dd>{longDate.format(validUntil)}</dd></div>
              ) : null}
            </dl>
            {accepted || view.status === "rejected" ? (
              <p className="pq-decided" role="status">
                {accepted
                  ? `Questo preventivo è stato accettato${view.decidedAt ? ` il ${longDate.format(view.decidedAt)}` : ""}.`
                  : `Questo preventivo è stato rifiutato${view.decidedAt ? ` il ${longDate.format(view.decidedAt)}` : ""}.`}
              </p>
            ) : (
              <PublicDecisionForm
                token={clean}
                status={view.status}
                decidedAt={view.decidedAt ? view.decidedAt.toISOString() : null}
                defaultName={snapshot.client?.contactName || (snapshot.client?.kind === "privato" ? snapshot.client.name : "") || ""}
                defaultEmail={snapshot.client?.email ?? ""}
              />
            )}
            <a className="pq-btn dark block" href={pdfHref} download>
              <Download size={16} aria-hidden="true" /> Scarica il PDF
            </a>
          </section>
          {payment ? <PublicPaymentSection token={clean} payment={payment} /> : null}
          {view.contactEmail ? (
            <a className="pq-contact" href={`mailto:${view.contactEmail}?subject=${encodeURIComponent(`Preventivo ${snapshot.quote.number ?? ""} ${snapshot.quote.title}`.trim())}`}>
              <span className="pq-av" aria-hidden="true">
                <Mail size={15} />
              </span>
              <span>
                <strong>Hai una domanda?</strong>
                <small>Scrivi {contactFirst ? `a ${contactFirst}` : "allo studio"}: {view.contactEmail}</small>
              </span>
            </a>
          ) : null}
          <p className="pq-note">
            <Lock size={13} aria-hidden="true" /> Link privato, inviato solo a te.
          </p>
        </aside>
      </main>

      <div className="pq-bar" aria-label="Totale e PDF">
        <div>
          <small>Totale IVA inclusa</small>
          <strong>{total}</strong>
        </div>
        <a className="pq-btn dark" href={pdfHref} download>
          <Download size={16} aria-hidden="true" /> PDF
        </a>
      </div>
      <LegalLinks className="pq-legal" />
    </div>
  );
}

function StatePage({ view }: { view: Exclude<PublicQuoteView, { kind: "active" }> }) {
  const studio = "studioName" in view ? view : null;
  const title =
    view.kind === "expired" ? "Questo preventivo è scaduto" : view.kind === "limited" ? "Troppe richieste" : "Questo link non è più attivo";
  const body =
    view.kind === "expired"
      ? `La validità è terminata${view.expiredOn ? ` il ${longDate.format(view.expiredOn)}` : ""}. Scrivi a ${view.studioName} per chiedere una proroga o una proposta aggiornata.`
      : view.kind === "limited"
        ? "Hai aperto questa pagina molte volte in poco tempo. Riprova tra qualche minuto."
        : studio
          ? `Il link è stato sostituito o ritirato. Scrivi a ${studio.studioName} per riceverne uno nuovo.`
          : "Il link è sbagliato, è stato sostituito o non esiste più. Scrivi a chi te l'ha mandato per riceverne uno nuovo.";
  return (
    <div className="pq pq-state">
      <section className="pq-card pq-state-card">
        <span className="pq-state-ic" aria-hidden="true">
          {view.kind === "expired" ? <Clock size={22} /> : <Lock size={22} />}
        </span>
        <h1>{title}</h1>
        <p>{body}</p>
        {studio?.contactEmail ? (
          <a className="pq-btn dark" href={`mailto:${studio.contactEmail}`}>
            <Mail size={16} aria-hidden="true" /> Scrivi a {studio.contactName ?? studio.studioName}
          </a>
        ) : null}
      </section>
      <LegalLinks className="pq-legal" />
    </div>
  );
}
