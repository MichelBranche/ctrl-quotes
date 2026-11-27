import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, CircleHelp, Headset, LifeBuoy, Megaphone, Activity, MessageCircle } from "lucide-react";
import { HelpHero } from "@/components/help/help-hero";
import { HelpTutorialPlayer } from "@/components/help/help-tutorial-player";
import { topicIcons } from "@/components/help/help-icons";
import { LegalLinks } from "@/components/legal/legal-links";
import { PageHeader } from "@/components/ui/status";
import { SUPPORT_EMAIL, helpSearchIndex, helpTopics, supportMailto } from "@/domain/help";
import { checkHealth } from "@/server/health";

export const metadata = { title: "Aiuto e Supporto" };

export default function HelpPage() {
  return (
    <div className="hp">
      <PageHeader title="Aiuto e Supporto" subtitle="Guide, risposte e contatti per lavorare al meglio con CTRL® Quotes." />

      <HelpHero items={helpSearchIndex()} />

      <HelpTutorialPlayer />

      <div className="hp-quick">
        <Link href="/app/help/guide" className="hp-quick-card card">
          <span className="hp-quick-icon"><BookOpen size={20} aria-hidden="true" /></span>
          <span className="hp-quick-body">
            <strong>Guide rapide</strong>
            <span>Impara le basi in pochi minuti.</span>
          </span>
          <span className="hp-quick-arrow"><ArrowRight size={16} aria-hidden="true" /></span>
        </Link>
        <a href={supportMailto("Supporto CTRL® Quotes")} className="hp-quick-card card">
          <span className="hp-quick-icon"><Headset size={20} aria-hidden="true" /></span>
          <span className="hp-quick-body">
            <strong>Contatta il supporto</strong>
            <span>{SUPPORT_EMAIL}</span>
          </span>
          <span className="hp-quick-arrow"><ArrowUpRight size={16} aria-hidden="true" /></span>
        </a>
      </div>

      <div className="hp-grid">
        <section className="hp-topics card" aria-labelledby="hp-topics-title">
          <div className="hp-section-head">
            <h2 id="hp-topics-title">Esplora gli argomenti</h2>
            <Link href="/app/help/guide" className="hp-section-link">
              Vedi tutte le guide <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <ul className="hp-topic-list">
            {helpTopics.map((topic) => {
              const Icon = topicIcons[topic.id];
              return (
                <li key={topic.id}>
                  <Link href={`/app/help/${topic.id}`} className="hp-topic">
                    <span className="hp-topic-icon"><Icon size={20} aria-hidden="true" /></span>
                    <span className="hp-topic-body">
                      <strong>{topic.title}</strong>
                      <span>{topic.summary}</span>
                      <small>{topic.sections.length} articoli</small>
                    </span>
                    <ArrowRight className="hp-topic-arrow" size={16} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="hp-resources" aria-labelledby="hp-res-title">
          <div className="hp-section-head">
            <h2 id="hp-res-title">Risorse utili</h2>
          </div>
          <ul className="hp-res-list card">
            <li>
              <Link href="/app/help/faq" className="hp-res">
                <span className="hp-res-icon"><CircleHelp size={18} aria-hidden="true" /></span>
                <span className="hp-res-body"><strong>FAQ</strong><span>Le domande più frequenti.</span></span>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </li>
            <li>
              <Link href="/app/help/novita" className="hp-res">
                <span className="hp-res-icon"><Megaphone size={18} aria-hidden="true" /></span>
                <span className="hp-res-body"><strong>Novità e aggiornamenti</strong><span>Cosa è cambiato di recente.</span></span>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </li>
            <li>
              <Link href="/app/help/risorse" className="hp-res">
                <span className="hp-res-icon"><LifeBuoy size={18} aria-hidden="true" /></span>
                <span className="hp-res-body"><strong>Centro risorse</strong><span>Template, piani e documenti.</span></span>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </li>
            <li>
              <a href="/api/health" className="hp-res" target="_blank" rel="noopener">
                <span className="hp-res-icon"><Activity size={18} aria-hidden="true" /></span>
                <span className="hp-res-body"><strong>Stato del servizio</strong><span>Verifica in tempo reale.</span></span>
                <Suspense fallback={<span className="hp-status is-wait">Verifica…</span>}>
                  <ServiceStatus />
                </Suspense>
              </a>
            </li>
          </ul>
          <section className="hp-cta card" aria-labelledby="hp-cta-title">
            <span className="hp-cta-icon"><MessageCircle size={20} aria-hidden="true" /></span>
            <h2 id="hp-cta-title">Hai ancora bisogno di aiuto?</h2>
            <p>Scrivici: indica il preventivo o la pagina e cosa vedi sullo schermo.</p>
            <a href={supportMailto("Richiesta di supporto CTRL® Quotes")} className="btn btn-primary hp-cta-btn">
              <MessageCircle size={16} aria-hidden="true" /> Apri una richiesta
            </a>
          </section>
        </section>
      </div>


      <LegalLinks className="help-legal" />
    </div>
  );
}

async function ServiceStatus() {
  await connection();
  const status = await checkHealth();
  return status.ok ? (
    <span className="hp-status is-ok"><i aria-hidden="true" />Operativo</span>
  ) : (
    <span className="hp-status is-down"><i aria-hidden="true" />Non raggiungibile</span>
  );
}
