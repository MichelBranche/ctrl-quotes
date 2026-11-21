import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BarRow, Card, Delta, Empty, Locked, Stat } from "@/components/analytics/parts";
import { ValueChart } from "@/components/analytics/value-chart";
import {
  analyticsPeriods,
  asPeriod,
  canSeeMetric,
  computeCatalog,
  computeClients,
  computeEngagement,
  computeFunnel,
  computePayments,
  computePipeline,
  computeResponse,
  computeTeam,
  computeTemplates,
  computeValue,
  delta,
  metricPlan,
  periodRanges,
  type MetricId,
  type QuoteRef,
} from "@/domain/analytics";
import { formatEuro } from "@/domain/money";
import { cn } from "@/lib/cn";
import { loadAnalyticsInput } from "@/server/analytics";
import { requireContext } from "@/server/context";
import { loadWorkspaceEntitlement } from "@/server/entitlement";

export const metadata = { title: "Analytics avanzate" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function AnalyticsPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<div className="pt-wait" aria-busy="true" />}>
      <AnalyticsContent searchParams={searchParams} />
    </Suspense>
  );
}

const planLabel = { starter: "Starter", pro: "Pro", business: "Business" } as const;
const dateFmt = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" });
const hours = (h: number | null) => (h == null ? "n.d." : h < 48 ? `${h.toLocaleString("it-IT")} h` : `${Math.round(h / 24)} g`);
const days = (d: number | null) => (d == null ? "n.d." : `${d.toLocaleString("it-IT")} g`);
const pct = (v: number | null) => (v == null ? "n.d." : `${v}%`);

const lockedCopy: Record<MetricId, { title: string; body: string }> = {
  funnel: { title: "Imbuto di conversione", body: "" },
  response: { title: "Tempi di risposta", body: "Quanto ci mette il cliente ad aprire e a decidere." },
  value: { title: "Valore nel tempo", body: "Valore inviato e accettato, settimana per settimana." },
  pipeline: { title: "Pipeline aperta", body: "Preventivi in attesa e quelli in scadenza." },
  engagement: { title: "Coinvolgimento", body: "Aperture e preventivi da richiamare." },
  templates: { title: "Rendimento per template", body: "Quale template converte di più." },
  clients: { title: "Clienti migliori", body: "Chi accetta di più, per valore." },
  catalog: { title: "Servizi più venduti", body: "Le voci del catalogo nei preventivi accettati." },
  team: { title: "Rendimento del team", body: "Preventivi e accettazioni per persona." },
  payments: { title: "Incassi", body: "Pagato, acconti e da incassare, per metodo." },
};

function QuoteList({ items, dateLabel, extra }: { items: Array<QuoteRef & { views?: number }>; dateLabel: string; extra?: (item: QuoteRef & { views?: number }) => string }) {
  return (
    <ul className="an-qlist">
      {items.map((item) => (
        <li key={item.id}>
          <Link href={`/app/quotes/${item.id}`} className="an-qrow">
            <span className="an-qrow-main">
              <strong>{item.title}</strong>
              <span>{[item.number, item.client].filter(Boolean).join(" · ") || "Senza cliente"}</span>
            </span>
            <span className="an-qrow-side">
              <strong>{formatEuro(item.totalCents)}</strong>
              <span>{extra ? extra(item) : item.date ? `${dateLabel} ${dateFmt.format(item.date)}` : ""}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function AnalyticsContent({ searchParams }: { searchParams: Search }) {
  await connection();
  const period = asPeriod((await searchParams).p);
  const { db, actor, workspace } = await requireContext();
  const [entitlement, loaded] = await Promise.all([loadWorkspaceEntitlement(db, workspace), loadAnalyticsInput(db, actor, workspace.taxProfile)]);
  if (!loaded.ok) throw new Error(loaded.message);
  const input = loaded.value;
  const plan = entitlement.planId;
  const now = new Date();
  const ranges = periodRanges(period, now);
  const can = (id: MetricId) => canSeeMetric(plan, id);
  const lock = (id: MetricId, className?: string) => <Locked key={id} title={lockedCopy[id].title} body={lockedCopy[id].body} plan={metricPlan[id]} className={className} />;

  const funnel = computeFunnel(input, ranges);
  const steps = [
    { label: "Inviati", value: funnel.sent },
    { label: "Aperti dal cliente", value: funnel.viewed },
    { label: "Accettati", value: funnel.accepted },
    { label: "Pagati", value: funnel.paid },
  ];

  return (
    <div className="an">
      <Link href="/app/workspace" className="an-back">
        <ArrowLeft size={16} aria-hidden="true" /> Workspace
      </Link>
      <header className="an-head">
        <div>
          <h1>Analytics avanzate</h1>
          <p>
            {workspace.name} · piano {planLabel[plan]}. Dati degli ultimi {period} giorni, confrontati con i {period} precedenti.
          </p>
        </div>
        <nav className="an-period" aria-label="Periodo">
          {analyticsPeriods.map((p) => (
            <Link key={p} href={`/app/workspace/analytics?p=${p}`} className={cn(p === period && "is-active")} aria-current={p === period ? "page" : undefined}>
              {p === 365 ? "12 mesi" : `${p} giorni`}
            </Link>
          ))}
        </nav>
      </header>

      <Card title="Imbuto di conversione" hint="Preventivi inviati nel periodo e cosa è successo dopo." className="an-funnel">
        <div className="an-funnel-body">
          <div className="an-funnel-kpis">
            <Stat label="Tasso di accettazione" value={pct(funnel.acceptanceRate)}>
              <Delta value={funnel.acceptanceRate != null && funnel.previous.acceptanceRate != null ? funnel.acceptanceRate - funnel.previous.acceptanceRate : null} suffix=" pt" />
            </Stat>
            <Stat label="Inviati" value={String(funnel.sent)}>
              <Delta value={delta(funnel.sent, funnel.previous.sent)} />
            </Stat>
            <Stat label="Rifiutati" value={String(funnel.rejected)} />
          </div>
          {funnel.sent ? (
            <ol className="an-steps">
              {steps.map((step) => (
                <li key={step.label}>
                  <div className="an-step-bar">
                    <span style={{ height: `${Math.max(3, (step.value / funnel.sent) * 100)}%` }} />
                  </div>
                  <strong>{step.value}</strong>
                  <span>{step.label}</span>
                  <small>{Math.round((step.value / funnel.sent) * 100)}%</small>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Nessun preventivo inviato in questo periodo.</Empty>
          )}
        </div>
      </Card>

      <div className="an-grid">
        {can("response")
          ? (() => {
              const r = computeResponse(input, ranges);
              return (
                <Card title="Tempi di risposta" hint="Mediana dall'invio." plan="pro">
                  <div className="an-pair">
                    <Stat label="Fino alla prima apertura" value={hours(r.toViewHours)}>
                      <Delta value={r.toViewHours != null && r.previous.toViewHours != null ? delta(r.toViewHours, r.previous.toViewHours) : null} lowerIsBetter />
                    </Stat>
                    <Stat label="Fino alla decisione" value={days(r.toDecisionDays)}>
                      <Delta value={r.toDecisionDays != null && r.previous.toDecisionDays != null ? delta(r.toDecisionDays, r.previous.toDecisionDays) : null} lowerIsBetter />
                    </Stat>
                  </div>
                </Card>
              );
            })()
          : lock("response")}

        {can("pipeline")
          ? (() => {
              const p = computePipeline(input, now);
              return (
                <Card title="Pipeline aperta" hint="Inviati in attesa di risposta, oggi." plan="pro">
                  <div className="an-pair">
                    <Stat label={`${p.openCount} in attesa`} value={formatEuro(p.openCents)} />
                    <Stat label={`${p.expiringCount} in scadenza entro 7 giorni`} value={formatEuro(p.expiringCents)} />
                  </div>
                  {p.expiring.length ? <QuoteList items={p.expiring} dateLabel="scade il" /> : null}
                </Card>
              );
            })()
          : lock("pipeline")}

        {can("value")
          ? (() => {
              const v = computeValue(input, period, ranges);
              return (
                <Card title="Valore nel tempo" hint="Importi IVA inclusa: inviato per data di invio, accettato per data di decisione." plan="pro" className="an-wide">
                  <div className="an-pair is-three">
                    <Stat label="Valore inviato" value={formatEuro(v.sentCents)}>
                      <Delta value={delta(v.sentCents, v.previous.sentCents)} />
                    </Stat>
                    <Stat label="Valore accettato" value={formatEuro(v.acceptedCents)}>
                      <Delta value={delta(v.acceptedCents, v.previous.acceptedCents)} />
                    </Stat>
                    <Stat label="Di cui ricorrente accettato" value={formatEuro(v.acceptedRecurringCents)} />
                  </div>
                  <ValueChart buckets={v.buckets} />
                </Card>
              );
            })()
          : lock("value", "an-wide")}

        {can("engagement")
          ? (() => {
              const e = computeEngagement(input, ranges.current, now);
              return (
                <Card title="Coinvolgimento" hint="Da richiamare: aperti, senza risposta, ultima apertura da 3+ giorni." plan="pro">
                  <div className="an-pair">
                    <Stat label="Aperture medie per preventivo" value={e.avgViews == null ? "n.d." : e.avgViews.toLocaleString("it-IT")} />
                    <Stat label="Inviati mai aperti" value={String(e.neverOpened)} />
                  </div>
                  {e.followUp.length ? (
                    <QuoteList items={e.followUp} dateLabel="" extra={(item) => `${item.views} aperture · ultima ${item.date ? dateFmt.format(item.date) : ""}`} />
                  ) : (
                    <Empty>Nessun preventivo da richiamare.</Empty>
                  )}
                </Card>
              );
            })()
          : lock("engagement")}

        {can("templates")
          ? (() => {
              const rows = computeTemplates(input, ranges.current);
              return (
                <Card title="Rendimento per template" hint="Tasso di accettazione dei preventivi inviati nel periodo." plan="pro">
                  {rows.length ? (
                    <ul className="an-bars">
                      {rows.map((row) => (
                        <BarRow key={row.key} label={row.label} value={pct(row.rate)} ratio={(row.rate ?? 0) / 100} sub={`${row.sent} inviati · valore medio ${row.avgCents == null ? "n.d." : formatEuro(row.avgCents)}`} />
                      ))}
                    </ul>
                  ) : (
                    <Empty>Nessun preventivo inviato in questo periodo.</Empty>
                  )}
                </Card>
              );
            })()
          : lock("templates")}

        {can("clients")
          ? (() => {
              const rows = computeClients(input, ranges.current);
              const max = Math.max(1, ...rows.map((row) => row.acceptedCents));
              return (
                <Card title="Clienti migliori" hint="Valore accettato dei preventivi inviati nel periodo." plan="pro">
                  {rows.length ? (
                    <ul className="an-bars">
                      {rows.map((row) => (
                        <BarRow key={row.key} label={row.label} value={formatEuro(row.acceptedCents)} ratio={row.acceptedCents / max} sub={`${row.accepted} accettati su ${row.sent}`} />
                      ))}
                    </ul>
                  ) : (
                    <Empty>Nessun preventivo inviato in questo periodo.</Empty>
                  )}
                </Card>
              );
            })()
          : lock("clients")}

        {can("catalog")
          ? (() => {
              const rows = computeCatalog(input, ranges.current);
              const max = Math.max(1, ...rows.map((row) => row.netCents));
              return (
                <Card title="Servizi più venduti" hint="Voci del catalogo nei preventivi accettati nel periodo, imponibile." plan="business">
                  {rows.length ? (
                    <ul className="an-bars">
                      {rows.map((row) => (
                        <BarRow key={row.key} label={row.label} value={formatEuro(row.netCents)} ratio={row.netCents / max} sub={`in ${row.quotes} ${row.quotes === 1 ? "preventivo" : "preventivi"}`} />
                      ))}
                    </ul>
                  ) : (
                    <Empty>Nessuna voce del catalogo nei preventivi accettati del periodo.</Empty>
                  )}
                </Card>
              );
            })()
          : lock("catalog")}

        {can("payments")
          ? (() => {
              const p = computePayments(input, ranges);
              const max = Math.max(1, ...p.byMethod.map((row) => row.cents));
              return (
                <Card title="Incassi" hint="Pagamenti registrati nel periodo." plan="business">
                  <div className="an-pair is-three">
                    <Stat label="Incassato" value={formatEuro(p.collectedCents)}>
                      <Delta value={delta(p.collectedCents, p.previous.collectedCents)} />
                    </Stat>
                    <Stat label="Di cui acconti" value={formatEuro(p.depositCents)} />
                    <Stat label="Da incassare" value={formatEuro(p.outstandingCents)} />
                  </div>
                  {p.byMethod.length ? (
                    <ul className="an-bars">
                      {p.byMethod.map((row) => (
                        <BarRow key={row.method} label={row.label} value={formatEuro(row.cents)} ratio={row.cents / max} />
                      ))}
                    </ul>
                  ) : (
                    <Empty>Nessun pagamento registrato nel periodo.</Empty>
                  )}
                </Card>
              );
            })()
          : lock("payments")}

        {can("team")
          ? (() => {
              const rows = computeTeam(input, ranges.current);
              return (
                <Card title="Rendimento del team" hint="Per responsabile del preventivo." plan="business">
                  {rows.length ? (
                    <div className="an-table-wrap">
                      <table className="an-table">
                        <thead>
                          <tr>
                            <th scope="col">Persona</th>
                            <th scope="col">Creati</th>
                            <th scope="col">Inviati</th>
                            <th scope="col">Accettati</th>
                            <th scope="col">Tasso</th>
                            <th scope="col">Valore accettato</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.key}>
                              <th scope="row">{row.label}</th>
                              <td>{row.created}</td>
                              <td>{row.sent}</td>
                              <td>{row.accepted}</td>
                              <td>{pct(row.rate)}</td>
                              <td>{formatEuro(row.acceptedCents)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty>Nessuna attività del team nel periodo.</Empty>
                  )}
                </Card>
              );
            })()
          : lock("team")}
      </div>
    </div>
  );
}
