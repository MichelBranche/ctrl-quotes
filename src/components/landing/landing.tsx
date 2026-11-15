import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, CreditCard, FileDown, GripVertical, Landmark, MousePointer2, Bell, Eye, Wallet } from "lucide-react";
import {
  TRIAL_DURATION_DAYS,
  YEARLY_SAVINGS_PERCENT,
  plans,
  quoteSendDailyLimitLabel,
  teamSeatLimitLabel,
  teamSeatLimits,
  yearlyPriceCents,
  yearlyUndiscountedCents,
  type PlanId,
} from "@/domain/plans";
import { templateInfo, type TemplateKey } from "@/domain/templates";
import { LandingMotion, landingBootScript } from "./motion";
import { LoginLink, StartCta } from "./cta";
import { PricingPlans, type LandingPlan } from "./pricing";
import { Faq } from "./faq";

const TRIAL = `${TRIAL_DURATION_DAYS} giorni gratis`;

/** Splits a heading into masked lines for the rise-in animation. */
function Lines({ lines }: { lines: ReactNode[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <span className="lp-line" key={i}>
          <span>{line}</span>
        </span>
      ))}
    </>
  );
}

function Words({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((word, i) => (
        <span className="lp-word" key={i}>
          {word}{" "}
        </span>
      ))}
    </>
  );
}

function Target() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="10" cy="10" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="10" cy="10" r="1.4" fill="currentColor" />
    </svg>
  );
}

function Sticker({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`lp-sticker ${className}`}>
      <Target />
      {children}
    </span>
  );
}

function Badge({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`lp-badge ${className}`} aria-hidden="true">
      <svg viewBox="0 0 200 200" className="lp-badge-ring">
        <defs>
          <path id={`ring-${className || "a"}`} d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
        </defs>
        <text>
          <textPath href={`#ring-${className || "a"}`} startOffset="0" textLength="486" lengthAdjust="spacing">
            {text}
          </textPath>
        </text>
      </svg>
      <span className="lp-badge-core">
        <svg viewBox="0 0 48 40" width="38" height="32">
          <path d="M4 22c0-9 5-16 14-19l2 4c-5 2-8 6-8 10h7v19H4V22Zm24 0c0-9 5-16 14-19l2 4c-5 2-8 6-8 10h7v19H28V22Z" fill="currentColor" />
        </svg>
      </span>
    </div>
  );
}

function Squiggle({ className = "" }: { className?: string }) {
  return (
    <svg className={`lp-squiggle lp-draw ${className}`} viewBox="0 0 180 120" fill="none" aria-hidden="true">
      <path d="M8 20c30-14 62 2 58 26-3 22-36 24-34 6 3-24 52-22 78-4 18 12 30 34 34 56" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M128 96l17 12 9-20" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Corner({ tone = "dark" }: { tone?: "dark" | "lime" | "white" | "violet" }) {
  return (
    <span className={`lp-corner is-${tone}`} aria-hidden="true">
      <ArrowUpRight size={22} strokeWidth={2.4} />
    </span>
  );
}

/* ---------- Hero mock: a recreation of the public quote page, with fixture data only ---------- */

const mockLines = [
  { name: "Analisi e strategia", price: "800,00" },
  { name: "UX/UI Design", price: "1.500,00" },
  { name: "Sviluppo sito web", price: "3.200,00" },
];

function HeroStage() {
  return (
    <div className="lp-hero-stage" aria-hidden="true">
      <div className="lp-float lp-float-cover" data-depth="0.6">
        <div className="lp-bob" style={{ animationDelay: "-2s" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/tpl-bold.webp" alt="" width={320} height={452} fetchPriority="high" />
        </div>
      </div>
      <div className="lp-float lp-float-quote" data-depth="1">
        <div className="lp-bob">
          <div className="lp-mock">
            <div className="lp-mock-bar">
              <span />
              <span />
              <span />
              <p>quotes.ctrlagency.dev/q/…</p>
            </div>
            <div className="lp-mock-body">
              <div className="lp-mock-head">
                <span className="lp-mock-logo">SE</span>
                <div>
                  <p className="lp-mock-from">Studio Esempio</p>
                  <p className="lp-mock-num">Preventivo PRE-2025-001</p>
                </div>
                <span className="lp-mock-chip">Da accettare</span>
              </div>
              <p className="lp-mock-title">Nuovo sito web</p>
              <p className="lp-mock-for">Proposta per Cliente Esempio</p>
              <ul className="lp-mock-lines">
                {mockLines.map((line) => (
                  <li key={line.name}>
                    <span>{line.name}</span>
                    <b>€ {line.price}</b>
                  </li>
                ))}
              </ul>
              <div className="lp-mock-total">
                <span>Totale imponibile</span>
                <b>€ 5.500,00</b>
              </div>
              <div className="lp-mock-cta">
                <span className="lp-mock-accept">
                  <Check size={16} strokeWidth={3} /> Accetta preventivo
                </span>
                <span className="lp-mock-pdf">
                  <FileDown size={16} /> PDF
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="lp-float lp-float-accepted" data-depth="1.6">
        <div className="lp-bob" style={{ animationDelay: "-1s" }}>
          <div className="lp-toast is-lime">
            <span className="lp-toast-ico">
              <Check size={18} strokeWidth={3} />
            </span>
            <div>
              <p>Preventivo accettato</p>
              <span>Cliente Esempio · adesso</span>
            </div>
          </div>
        </div>
      </div>
      <div className="lp-float lp-float-paid" data-depth="2">
        <div className="lp-bob" style={{ animationDelay: "-3s" }}>
          <div className="lp-toast is-glass">
            <span className="lp-toast-ico is-orange">
              <Wallet size={18} strokeWidth={2.4} />
            </span>
            <div>
              <p>Acconto ricevuto</p>
              <span>IBAN · PayPal · Stripe</span>
            </div>
          </div>
        </div>
      </div>
      <Badge text="PREVENTIVI CHE CHIUDONO ✺ CTRL® QUOTES ✺ " className="lp-badge-hero" />
    </div>
  );
}

/* ---------- Pricing data straight from src/domain/plans.ts ---------- */

function landingPlans(): LandingPlan[] {
  const order: PlanId[] = ["starter", "pro", "business"];
  return order.map((id) => {
    const plan = plans[id];
    const sellable = id !== "starter";
    return {
      id,
      name: plan.name.replace(/^Piano /, ""),
      line: plan.pickerLine,
      monthlyCents: plan.priceCents,
      yearlyCents: sellable ? yearlyPriceCents(plan.priceCents) : null,
      yearlyFullCents: sellable ? yearlyUndiscountedCents(plan.priceCents) : null,
      limits: [quoteSendDailyLimitLabel(id), teamSeatLimitLabel(id)],
      includes: plan.includes
        .filter((item) => item.icon !== "send" && !/nel workspace/i.test(item.label))
        .map((item) => ({ label: item.label, soon: item.soon })),
      note: sellable ? undefined : "Il livello base della prova, non si acquista a parte",
    };
  });
}

const faqs = [
  {
    q: "Serve la carta di credito per provarlo?",
    a: `No. Ti registri e hai ${TRIAL} con i limiti del Piano Pro, senza inserire una carta. Scegli un abbonamento solo se vuoi continuare.`,
  },
  {
    q: "Cosa succede quando finisce la prova?",
    a: "I tuoi preventivi, clienti e servizi restano dove sono. Per continuare a modificarli e inviarne di nuovi attivi il Piano Pro o il Piano Business, mensile o annuale.",
  },
  {
    q: "Il mio cliente deve registrarsi?",
    a: "No. Riceve un link privato, legge il preventivo da telefono o computer, scarica il PDF e lo accetta online. Tu ricevi una notifica quando lo apre e quando decide.",
  },
  {
    q: "Come vengo pagato?",
    a: "Scegli tu i metodi nelle impostazioni: bonifico con il tuo IBAN, PayPal oppure carta tramite Stripe. Con Stripe Connect gli incassi arrivano direttamente sul tuo conto, non passano da noi.",
  },
  {
    q: "Gestisce IVA, forfettario e ritenuta?",
    a: "Sì. Imposti il profilo fiscale del workspace (ordinario, forfettario o estero) e i totali si calcolano da soli, con ritenuta d'acconto e nota sull'imposta di bollo quando servono. Le regole vanno sempre confermate con il tuo commercialista.",
  },
  {
    q: "Posso usare il mio brand?",
    a: "Sì. Carichi logo e colori nel Brand Kit e scegli tra cinque template: Bold Impact, Corporate Executive, Editorial Atelier, Studio Editorial e Swiss Minimal. Ogni preventivo li usa in automatico.",
  },
  {
    q: "Posso lavorare con il mio team?",
    a: `Sì. Inviti le persone nel workspace: ${teamSeatLimits.starter} posto con Starter, fino a ${teamSeatLimits.pro} con Pro e posti illimitati con Business.`,
  },
  {
    q: "Posso disdire quando voglio?",
    a: `Sì. Gestisci, cambi o annulli l'abbonamento da Impostazioni, Abbonamento. Con l'annuale risparmi il ${YEARLY_SAVINGS_PERCENT}% rispetto a dodici mesi pagati uno per uno.`,
  },
];

const templateOrder: TemplateKey[] = ["bold", "corporate", "editorial", "studio", "minimal"];

const marqueeA = ["Preventivi interattivi", "PDF professionale", "Accettazione online", "IBAN", "PayPal", "Stripe", "Brand Kit", "Team"];
const marqueeB = ["Bold Impact", "Corporate Executive", "Editorial Atelier", "Studio Editorial", "Swiss Minimal"];

function Band({ items, tone, reverse = false }: { items: string[]; tone: "lime" | "orange"; reverse?: boolean }) {
  const row = (hidden: boolean) => (
    <div className="lp-band-row" aria-hidden={hidden || undefined}>
      {items.map((item) => (
        <span key={item}>
          {item}
          <i>✺</i>
        </span>
      ))}
    </div>
  );
  return (
    <div className={`lp-band is-${tone}${reverse ? " is-reverse" : ""}`}>
      <div className="lp-band-track">
        <div className="lp-band-inner">
          {row(false)}
          {row(true)}
        </div>
      </div>
    </div>
  );
}

export function Landing() {
  const pricingPlans = landingPlans();
  return (
    <LandingMotion>
      <script dangerouslySetInnerHTML={{ __html: landingBootScript }} />
      <a className="skip-link visually-hidden" href="#contenuto">
        Vai al contenuto
      </a>
      <div className="lp-page">
        {/* ---------------- HERO ---------------- */}
        <section className="lp-hero" aria-labelledby="lp-hero-title">
          <div className="lp-hero-bg" aria-hidden="true">
            <span className="lp-blob is-lime" />
            <span className="lp-blob is-orange" />
            <span className="lp-blob is-blue" />
            <span className="lp-grid" />
            <span className="lp-noise" />
          </div>
          <header className="lp-nav">
            <Link href="/" className="lp-nav-logo" aria-label="CTRL® Quotes, home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo.png" alt="" width={150} height={33} />
            </Link>
            <nav aria-label="Sezioni">
              <a href="#funzionalita">Funzionalità</a>
              <a href="#template">Template</a>
              <a href="#come-funziona">Come funziona</a>
              <a href="#prezzi">Prezzi</a>
              <a href="#faq">FAQ</a>
            </nav>
            <div className="lp-nav-actions">
              <LoginLink />
              <StartCta label="Prova gratis" className="lp-btn lp-btn-lime lp-btn-sm" icon={false} />
            </div>
          </header>

          <div className="lp-hero-inner" id="contenuto">
            <div className="lp-hero-copy">
              <p className="lp-hero-kicker">
                <span className="lp-dot" /> {TRIAL} con i limiti Pro, senza carta
              </p>
              <h1 id="lp-hero-title">
                <span className="lp-line">
                  <span>Preventivi</span>
                </span>
                <span className="lp-line">
                  <span>che</span>
                </span>
                <span className="lp-line lp-line-mark">
                  <span>
                    <span className="lp-mark">chiudono</span>
                  </span>
                </span>
              </h1>
              <p className="lp-hero-sub">
                Crea preventivi con il tuo brand, mandali con un link e lascia che il cliente li <b>legga</b>, li <b>accetti</b> e li <b>paghi</b> online.
                IVA, forfettario e ritenuta già calcolati.
              </p>
              <div className="lp-hero-actions">
                <StartCta label="Inizia la prova gratuita" />
                <a href="#come-funziona" className="lp-btn lp-btn-ghost">
                  Guarda come funziona
                </a>
              </div>
              <ul className="lp-hero-proof">
                <li>
                  <Check size={15} strokeWidth={3} /> Nessuna carta richiesta
                </li>
                <li>
                  <Check size={15} strokeWidth={3} /> Il cliente non si registra
                </li>
                <li>
                  <Check size={15} strokeWidth={3} /> PDF incluso
                </li>
              </ul>
            </div>
            <HeroStage />
          </div>
          <Sticker className="lp-sticker-hero-a">Link di accettazione</Sticker>
          <Squiggle className="lp-squiggle-hero" />
        </section>

        {/* ---------------- BANDS ---------------- */}
        <div className="lp-bands" aria-hidden="true">
          <Band items={marqueeA} tone="lime" />
          <Band items={marqueeB} tone="orange" reverse />
        </div>

        {/* ---------------- MANIFESTO ---------------- */}
        <section className="lp-manifesto" aria-label="Perché CTRL® Quotes">
          <div className="lp-wrap">
            <p className="lp-eyebrow">
              <span>01</span> Perché
            </p>
            <p className="lp-manifesto-text">
              <Words text="Basta PDF allegati che nessuno apre e mail che restano senza risposta." />{" "}
              <span className="lp-pill is-violet">
                <Words text="Un preventivo" />
              </span>{" "}
              <Words text="si legge, si" />{" "}
              <span className="lp-pill is-lime">
                <Words text="accetta" />
              </span>{" "}
              <Words text="e si paga in un unico posto." />{" "}
              <em>
                <Words text="Tu sai sempre a che punto è." />
              </em>
            </p>
          </div>
        </section>

        {/* ---------------- FEATURES BENTO ---------------- */}
        <section className="lp-features" id="funzionalita" aria-labelledby="lp-feat-title">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <p className="lp-eyebrow">
                <span>02</span> Funzionalità
              </p>
              <h2 id="lp-feat-title" className="lp-display" data-split="">
                <Lines lines={["Tutto quello", <>che serve per <span className="lp-pill is-orange">vendere</span></>]} />
              </h2>
            </div>

            <div className="lp-bento">
              {/* Editor */}
              <article className="lp-tile is-dark is-editor" data-reveal="">
                <div className="lp-tile-text">
                  <p className="lp-tile-tag">Editor</p>
                  <h3>Moduli o editor visuale, scegli tu</h3>
                  <p>Componi il preventivo a blocchi: copertina, servizi, tempistiche, condizioni, firma. Oppure modificalo direttamente sulla pagina.</p>
                </div>
                <div className="lp-editor-ui" aria-hidden="true">
                  <div className="lp-seg">
                    <span className="is-on">Moduli</span>
                    <span>Visuale</span>
                  </div>
                  <ul>
                    {["Copertina", "Introduzione", "Servizi e prezzi", "Tempistiche", "Condizioni", "Firma"].map((block, i) => (
                      <li key={block} className={i === 2 ? "is-active" : undefined} style={{ ["--i" as string]: i }}>
                        <GripVertical size={16} />
                        <span>{block}</span>
                        <i>{String(i + 1).padStart(2, "0")}</i>
                      </li>
                    ))}
                  </ul>
                </div>
                <Badge text="TRASCINA ✺ RIORDINA ✺ PUBBLICA ✺ " className="lp-badge-editor" />
              </article>

              {/* Link di accettazione */}
              <article className="lp-tile is-lime is-link" data-reveal="">
                <span className="lp-notch" />
                <Corner tone="dark" />
                <div className="lp-tile-text">
                  <p className="lp-tile-tag">Accettazione online</p>
                  <h3>Un link, un clic, preventivo accettato</h3>
                  <p>Il cliente apre il link privato, legge, scarica il PDF e accetta. Niente account, niente stampe da firmare.</p>
                </div>
                <div className="lp-accept-ui" aria-hidden="true">
                  <div className="lp-accept-bar">quotes.ctrlagency.dev/q/•••••••</div>
                  <div className="lp-accept-row">
                    <span className="lp-accept-total">
                      Totale <b>€ 5.500,00</b>
                    </span>
                    <span className="lp-accept-btn">
                      <span className="is-idle">Accetta preventivo</span>
                      <span className="is-done">
                        <Check size={16} strokeWidth={3} /> Accettato
                      </span>
                    </span>
                    <MousePointer2 className="lp-accept-cursor" size={22} fill="#111" />
                  </div>
                </div>
              </article>

              {/* PDF */}
              <article className="lp-tile is-white is-pdf" data-reveal="">
                <div className="lp-tile-text">
                  <p className="lp-tile-tag">PDF</p>
                  <h3>PDF professionale</h3>
                  <p>Stesso layout del link, pronto da allegare o stampare.</p>
                </div>
                <div className="lp-pdf-stack" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/landing/tpl-corporate-2.webp" alt="" width={320} height={452} loading="lazy" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/landing/tpl-corporate.webp" alt="" width={320} height={452} loading="lazy" />
                  <span className="lp-pdf-tag">PDF</span>
                </div>
              </article>

              {/* Pagamenti */}
              <article className="lp-tile is-violet is-pay" data-reveal="">
                <div className="lp-tile-text">
                  <p className="lp-tile-tag">Pagamenti</p>
                  <h3>Incassa subito l&apos;acconto</h3>
                </div>
                <ul className="lp-pay-list">
                  <li>
                    <Landmark size={18} /> Bonifico IBAN
                  </li>
                  <li>
                    <Wallet size={18} /> PayPal
                  </li>
                  <li>
                    <CreditCard size={18} /> Carta con Stripe
                  </li>
                </ul>
                <p className="lp-tile-foot">Scegli i metodi quando invii il preventivo.</p>
              </article>

              {/* Clienti e servizi */}
              <article className="lp-tile is-white is-crm" data-reveal="">
                <div className="lp-tile-text">
                  <p className="lp-tile-tag">Clienti e servizi</p>
                  <h3>Rubrica e catalogo sempre pronti</h3>
                </div>
                <ul className="lp-crm-list" aria-hidden="true">
                  {[
                    ["CE", "Cliente Esempio", "Azienda"],
                    ["SD", "Studio Demo", "Professionista"],
                    ["BD", "Bottega Demo", "Azienda"],
                  ].map(([ini, name, kind], i) => (
                    <li key={name}>
                      <span className={`lp-av is-${i}`}>{ini}</span>
                      <span>
                        <b>{name}</b>
                        <small>{kind}</small>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="lp-tile-foot">Importi i clienti da CSV e riusi i servizi con un clic.</p>
              </article>

              {/* Grafici */}
              <article className="lp-tile is-dark is-chart" data-reveal="">
                <span className="lp-notch" />
                <Corner tone="lime" />
                <div className="lp-tile-text">
                  <p className="lp-tile-tag">Grafici</p>
                  <h3>Vedi come va, a colpo d&apos;occhio</h3>
                  <p>Preventivi inviati, accettati e importi nella panoramica, con grafici che si aggiornano da soli.</p>
                </div>
                <svg className="lp-chart" viewBox="0 0 320 150" aria-hidden="true">
                  {[46, 70, 58, 92, 80, 112, 98, 130].map((h, i) => (
                    <rect key={i} className="lp-chart-bar" x={8 + i * 39} y={140 - h} width="26" height={h} rx="8" fill={i === 7 ? "#C6FF3D" : i % 2 ? "#5A3BFF" : "rgba(255,255,255,.16)"} />
                  ))}
                  <line x1="0" y1="140.5" x2="320" y2="140.5" stroke="rgba(255,255,255,.18)" />
                </svg>
              </article>

              {/* Team */}
              <article className="lp-tile is-orange is-team" data-reveal="">
                <div className="lp-tile-text">
                  <p className="lp-tile-tag">Team</p>
                  <h3>Lavora con il tuo team</h3>
                </div>
                <div className="lp-team-av" aria-hidden="true">
                  {["MR", "GL", "AS", "+"].map((ini, i) => (
                    <span key={ini} className={`lp-av is-${i}`}>
                      {ini}
                    </span>
                  ))}
                </div>
                <p className="lp-tile-foot">
                  Starter {teamSeatLimits.starter} · Pro {teamSeatLimits.pro} · Business illimitati
                </p>
              </article>

              {/* Fisco */}
              <article className="lp-tile is-paper is-tax" data-reveal="">
                <div className="lp-tile-text">
                  <p className="lp-tile-tag">Fisco italiano</p>
                  <h3>
                    I conti tornano, <em>sempre</em>
                  </h3>
                  <p>Profilo fiscale del workspace e totali calcolati al centesimo.</p>
                </div>
                <ul className="lp-chips" aria-label="Regimi e voci gestite">
                  {["IVA ordinaria", "Regime forfettario", "Ritenuta d'acconto", "Imposta di bollo", "Clienti esteri", "Canoni mensili e annuali"].map((chip) => (
                    <li key={chip}>{chip}</li>
                  ))}
                </ul>
              </article>

              {/* Notifiche */}
              <article className="lp-tile is-blue is-notify" data-reveal="">
                <div className="lp-tile-text">
                  <p className="lp-tile-tag">Notifiche</p>
                  <h3>Sai quando lo apre</h3>
                  <p>Una notifica quando il cliente apre il preventivo, quando lo accetta e quando paga.</p>
                </div>
                <ul className="lp-notify-list" aria-hidden="true">
                  <li>
                    <Eye size={16} /> Preventivo aperto
                  </li>
                  <li>
                    <Check size={16} strokeWidth={3} /> Preventivo accettato
                  </li>
                  <li>
                    <Bell size={16} /> Pagamento ricevuto
                  </li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- TEMPLATES ---------------- */}
        <section className="lp-tpl" id="template" aria-labelledby="lp-tpl-title">
          <div className="lp-tpl-bg" aria-hidden="true">
            <span className="lp-blob is-violet" />
            <span className="lp-blob is-lime-soft" />
            <span className="lp-grid is-dark" />
          </div>
          <div className="lp-wrap lp-tpl-inner">
            <div className="lp-tpl-head">
              <p className="lp-eyebrow is-light">
                <span>03</span> Template
              </p>
              <h2 id="lp-tpl-title" className="lp-display" data-split="">
                <Lines lines={[<><span className="lp-pill is-lime">5 template</span></>, "zero impaginazione"]} />
              </h2>
              <p className="lp-tpl-lead">Scegli lo stile, il contenuto si adatta. Logo e colori arrivano dal tuo Brand Kit.</p>
            </div>
            <div className="lp-tpl-fan">
              {templateOrder.map((key) => (
                <figure key={key} className="lp-tpl-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/landing/tpl-${key}.webp`} alt={`Copertina di esempio del template ${templateInfo[key].name}`} width={320} height={452} loading="lazy" />
                  <figcaption>
                    <b>{templateInfo[key].name}</b>
                    <span>
                      {templateInfo[key].swatches.map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- HOW IT WORKS ---------------- */}
        <section className="lp-steps" id="come-funziona" aria-labelledby="lp-steps-title">
          <div className="lp-wrap">
            <div className="lp-section-head is-row">
              <div>
                <p className="lp-eyebrow">
                  <span>04</span> Come funziona
                </p>
                <h2 id="lp-steps-title" className="lp-display" data-split="">
                  <Lines lines={["Tre passi,", <>poi <span className="lp-pill is-violet">firmano</span></>]} />
                </h2>
              </div>
              <Squiggle className="lp-squiggle-steps" />
            </div>
            <ol className="lp-step-grid">
              <li className="lp-step is-lime" data-reveal="">
                <span className="lp-step-num">01</span>
                <h3>Imposta il tuo brand</h3>
                <p>Logo, colori, dati fiscali e catalogo dei servizi. Lo fai una volta, all&apos;inizio, in pochi passaggi guidati.</p>
                <Sticker className="lp-sticker-step">Una volta sola</Sticker>
              </li>
              <li className="lp-step is-violet" data-reveal="">
                <span className="lp-step-num">02</span>
                <h3>Componi il preventivo</h3>
                <p>Scegli cliente e servizi, sistema i moduli o lavora nell&apos;editor visuale. Prezzi e imposte si calcolano da soli.</p>
                <Sticker className="lp-sticker-step">Template inclusi</Sticker>
              </li>
              <li className="lp-step is-orange" data-reveal="">
                <span className="lp-step-num">03</span>
                <h3>Invia e incassa</h3>
                <p>Mandi il link per email o lo copi dove vuoi. Il cliente accetta online e paga con IBAN, PayPal o Stripe.</p>
                <Sticker className="lp-sticker-step">Notifiche in tempo reale</Sticker>
              </li>
            </ol>
          </div>
        </section>

        {/* ---------------- PRICING ---------------- */}
        <section className="lp-pricing" id="prezzi" aria-labelledby="lp-price-title">
          <div className="lp-pricing-bg" aria-hidden="true">
            <span className="lp-blob is-lime" />
            <span className="lp-blob is-orange" />
            <span className="lp-grid" />
            <span className="lp-noise" />
          </div>
          <div className="lp-wrap">
            <div className="lp-section-head is-center">
              <p className="lp-eyebrow is-light">
                <span>05</span> Prezzi
              </p>
              <h2 id="lp-price-title" className="lp-display" data-split="">
                <Lines lines={["Prezzi chiari,", <><span className="lp-pill is-lime">{TRIAL}</span></>]} />
              </h2>
            </div>
            <PricingPlans
              plans={pricingPlans}
              savingsLabel={`-${YEARLY_SAVINGS_PERCENT}%`}
              trialLine={`Ogni account parte con ${TRIAL} ai limiti del Piano Pro. Nessuna carta per iniziare, l'abbonamento parte solo se lo attivi.`}
              ctas={{
                starter: <StartCta label="Inizia gratis" className="lp-btn lp-btn-dark lp-btn-block" />,
                pro: <StartCta label="Prova Pro gratis" className="lp-btn lp-btn-dark lp-btn-block" />,
                business: <StartCta label="Inizia con la prova" className="lp-btn lp-btn-lime lp-btn-block" />,
              }}
            />
          </div>
        </section>

        {/* ---------------- FAQ ---------------- */}
        <section className="lp-faq" id="faq" aria-labelledby="lp-faq-title">
          <div className="lp-wrap lp-faq-grid">
            <div className="lp-faq-side">
              <p className="lp-eyebrow">
                <span>06</span> FAQ
              </p>
              <h2 id="lp-faq-title" className="lp-display is-sm" data-split="">
                <Lines lines={["Domande", <><span className="lp-pill is-orange">frequenti</span></>]} />
              </h2>
              <p className="lp-faq-lead">Non trovi la risposta? Scrivici dal sito di CTRL® Agency.</p>
              <Badge text="RISPOSTE CHIARE ✺ ZERO SORPRESE ✺ " className="lp-badge-faq" />
            </div>
            <Faq items={faqs} />
          </div>
        </section>

        {/* ---------------- FINAL CTA ---------------- */}
        <section className="lp-final" aria-labelledby="lp-final-title">
          <div className="lp-final-bg" aria-hidden="true">
            <span className="lp-grid is-dark" />
            <span className="lp-blob is-violet-soft" />
          </div>
          <div className="lp-wrap lp-final-inner">
            <Sticker className="lp-sticker-final">Pronto in pochi minuti</Sticker>
            <h2 id="lp-final-title" className="lp-display is-xl" data-split="">
              <Lines lines={["Il prossimo", <>preventivo <span className="lp-pill is-violet">chiude</span></>]} />
            </h2>
            <p>
              Prova CTRL® Quotes per {TRIAL}, con tutto il Piano Pro. Senza carta.
            </p>
            <div className="lp-final-actions">
              <StartCta label="Crea il tuo account" className="lp-btn lp-btn-dark lp-btn-lg" />
            </div>
            <Badge text="7 GIORNI GRATIS ✺ LIVELLO PRO ✺ SENZA CARTA ✺ " className="lp-badge-final" />
          </div>
        </section>

        {/* ---------------- FOOTER ---------------- */}
        <footer className="lp-footer">
          <div className="lp-wrap lp-footer-inner">
            <div className="lp-footer-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo.png" alt="CTRL® Quotes" width={150} height={33} loading="lazy" />
              <p>Preventivi interattivi per freelance, studi e piccole imprese.</p>
            </div>
            <nav aria-label="Link legali" className="lp-footer-links">
              <a href="/privacy">Privacy</a>
              <a href="/termini">Termini</a>
              <a href="/privacy#cookie">Cookie</a>
              <a href="/login" data-lp-leave="">
                Accedi
              </a>
            </nav>
          </div>
          <div className="lp-wrap lp-footer-bottom">
            <span>© CTRL® Quotes</span>
            <a href="https://www.ctrlagency.dev" target="_blank" rel="noopener">
              by CTRL® Agency <ArrowUpRight size={14} />
            </a>
          </div>
          <p className="lp-footer-giant" aria-hidden="true">
            CTRL® QUOTES
          </p>
        </footer>
      </div>
    </LandingMotion>
  );
}
