import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { ArrowRight, Check, ChevronRight, Clock3, Layers, LayoutGrid, Palette, Plus, Send } from "lucide-react";
import { OverviewMotion, OvCard, OvHead, OvRow, ovDirs } from "@/components/overview/overview-motion";
import { RecentQuotes } from "@/components/overview/recent-quotes";
import { TemplateWaves } from "@/components/overview/template-waves";
import { IllustratedEmpty } from "@/components/ui/illustrated-empty";
import { formatEuro } from "@/domain/money";
import { can } from "@/domain/permissions";
import { greetingFor, messages } from "@/i18n/it";
import { cn } from "@/lib/cn";
import { requireContext } from "@/server/context";
import { loadOverviewStats } from "@/server/overview";
import { listQuotes } from "@/server/quotes";

export const metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <Suspense fallback={<div className="pt-wait" aria-busy="true" />}>
      <OverviewContent />
    </Suspense>
  );
}

async function OverviewContent() {
  await connection();
  const { db, actor, workspace, userName } = await requireContext();
  const firstName = userName.split(" ")[0] ?? userName;
  const [statsResult, list] = await Promise.all([loadOverviewStats(db, actor), listQuotes(db, actor, { pageSize: 30 })]);
  if (!statsResult.ok) throw new Error(statsResult.message);
  const stats = statsResult.value;
  const rows = list.ok ? list.value.items : [];
  const canWrite = can(workspace.role, "quotes.write");
  const steps = [
    { done: stats.setup.brand, label: "Personalizza il tuo brand", href: "/app/settings/brand", icon: Palette },
    { done: stats.setup.catalog, label: "Aggiungi i tuoi servizi", href: "/app/catalog", icon: Layers },
    { done: stats.setup.firstQuote, label: "Crea il primo preventivo", href: "/app/quotes/new", icon: Send },
  ];
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <OverviewMotion>
      <OvHead className="ov-head">
        <h1>{`${greetingFor(new Date())}, ${firstName}.`}</h1>
        <p>Il tuo workspace per creare, gestire e inviare preventivi professionali.</p>
      </OvHead>

      <OvRow className="ov-row-top">
        <OvCard dir={ovDirs.hero} className="ov-hero brand-fill" aria-labelledby="ov-hero-title">
          <div className="ov-hero-copy">
            <h2 id="ov-hero-title">Crea un nuovo preventivo</h2>
            <p>Scegli un template, personalizza i contenuti e invialo al tuo cliente in pochi minuti.</p>
            {canWrite ? (
              <Link className="ov-hero-btn" href="/app/quotes/new">
                <Plus size={18} aria-hidden="true" /> {messages.quotes.action}
              </Link>
            ) : null}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ov-hero-art" src="/brand/hero.webp" alt="" width={300} height={240} />
        </OvCard>

        <OvCard dir={ovDirs.setup} className="card ov-setup" aria-labelledby="ov-setup-title">
          <div className="ov-setup-head">
            <div>
              <h2 id="ov-setup-title">Configurazione iniziale</h2>
              <p>Completa i passaggi per iniziare.</p>
            </div>
            <span className="ov-badge">
              {doneCount}/{steps.length}
            </span>
          </div>
          <ul className="ov-steps">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <li key={step.href}>
                  <Link href={step.href} className={cn("ov-step", step.done && "is-done")}>
                    <span className="ov-radio" aria-hidden="true">
                      {step.done ? <Check size={12} strokeWidth={3} /> : null}
                    </span>
                    <Icon size={17} aria-hidden="true" />
                    <span className="ov-step-label">
                      {step.label}
                      {step.done ? <span className="visually-hidden"> (fatto)</span> : null}
                    </span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
          <div
            className="ov-progress"
            role="progressbar"
            aria-label="Configurazione completata"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={doneCount}
          >
            <span style={{ width: `${Math.max(6, (doneCount / steps.length) * 100)}%` }} />
          </div>
        </OvCard>
      </OvRow>

      <OvRow className="ov-kpis">
        <Kpi icon={<Layers size={20} aria-hidden="true" />} dir={ovDirs.kpi1} label="Valore preventivi" value={formatEuro(stats.totalValueCents)} note={`${stats.quoteCount} preventivi in totale`} />
        <Kpi icon={<Clock3 size={20} aria-hidden="true" />} dir={ovDirs.kpi2} label="Inviati" value={String(stats.sentCount)} note="Preventivi inviati al cliente" />
        <Kpi
          icon={<Check size={20} aria-hidden="true" />}
          dir={ovDirs.kpi3}
          label="Accettati"
          value={String(stats.acceptedCount)}
          note={stats.acceptanceRate === null ? "Tasso di accettazione" : `Tasso di accettazione ${stats.acceptanceRate}%`}
          accent
        />
      </OvRow>

      <OvRow className="ov-row-bottom">
        <OvCard dir={ovDirs.quotes} lift={false} className="card ov-quotes" aria-labelledby="ov-quotes-title">
          {rows.length > 0 ? (
            <RecentQuotes rows={rows} />
          ) : (
            <>
              <div className="ov-section-head">
                <h2 id="ov-quotes-title">I tuoi preventivi</h2>
                <Link className="ov-link-all" href="/app/quotes">
                  Vedi tutti <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
              <IllustratedEmpty
                scene="first-quote"
                title={messages.overview.emptyTitle}
                body={messages.overview.emptyBody}
                compact
                action={
                  canWrite ? (
                    <Link className="btn btn-secondary" href="/app/quotes/new">
                      <Send size={16} aria-hidden="true" /> Crea il primo preventivo
                    </Link>
                  ) : undefined
                }
              />
            </>
          )}
        </OvCard>

        <OvCard dir={ovDirs.templates} className="ov-templates brand-fill" aria-labelledby="ov-templates-title">
          <TemplateWaves />
          <div className="ov-section-head">
            <h2 id="ov-templates-title">
              <LayoutGrid size={18} aria-hidden="true" /> I tuoi template
            </h2>
            <Link className="ov-link-all" href="/app/templates">
              Vedi tutti <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <p className="ov-templates-lead">Scopri i template professionali e personalizzabili per ogni tipo di progetto.</p>
          <div className="ov-fan" aria-hidden="true">
            {/* Swiss Minimal and Corporate Executive: only on ultrawide screens (see overview.css). */}
            <div className="tpl tpl-minimal tpl-wide">
              <strong>Preventivo</strong>
              <b>01</b>
              <i />
            </div>
            <div className="tpl tpl-corporate tpl-wide">
              <strong>Preventivo</strong>
              <i />
            </div>
            <div className="tpl tpl-dark">
              <strong>Preventivo</strong>
            </div>
            <div className="tpl tpl-cream">
              <strong>Preventivo</strong>
            </div>
            <div className="tpl tpl-white">
              <strong>Preventivo</strong>
              <i />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/mountain.webp" alt="" />
            </div>
          </div>
        </OvCard>
      </OvRow>
    </OverviewMotion>
  );
}

function Kpi({ dir, icon, label, value, note, accent = false }: { dir: { x: number; y: number }; icon: React.ReactNode; label: string; value: string; note: string; accent?: boolean }) {
  return (
    <OvCard dir={dir} className={cn("card ov-kpi", accent && "is-accent")}>
      <span className="ov-kpi-ico">{icon}</span>
      <div>
        <h2>{label}</h2>
        <p className="ov-kpi-value">{value}</p>
        <p className="ov-kpi-note">{note}</p>
      </div>
      {accent ? (
        <span className="ov-bars" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      ) : null}
    </OvCard>
  );
}
