import type { ReactNode } from "react";
import Link from "next/link";
import { legalOperator } from "@/domain/legal";
import { LegalLinks } from "@/components/legal/legal-links";

export function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="legal">
      <header className="legal-top">
        <Link href="/login" className="legal-brand" aria-label={`${legalOperator.product}, accedi`}>
          <span className="legal-brand-tile">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/icon-compact.png" alt="" width={28} height={28} />
          </span>
          <span>CTRL® Quotes</span>
        </Link>
        <LegalLinks />
      </header>
      <article className="legal-doc">
        <header className="legal-intro">
          <h1>{title}</h1>
          <p className="legal-updated">Aggiornato al {legalOperator.updated}</p>
          <p className="legal-review" role="note">
            Questo testo è una bozza operativa redatta a partire dal funzionamento reale del servizio. Deve essere rivisto da un professionista prima di considerarlo vincolante.
          </p>
        </header>
        {children}
      </article>
      <footer className="legal-foot">
        <p>
          {legalOperator.product} è un servizio di {legalOperator.operator} ({legalOperator.owner}). Sito: {legalOperator.site}. App: {legalOperator.appHost}.
        </p>
        <LegalLinks />
      </footer>
    </div>
  );
}
