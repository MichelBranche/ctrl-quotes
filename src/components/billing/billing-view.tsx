"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { ArrowRight, ArrowUpRight, Check, ChartNoAxesColumn, Headset, Layers, LayoutGrid, Minus, ShieldCheck, UserRound, Users } from "lucide-react";
import { Dialog } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { compareRows, formatPlanPrice, planIds, plans, type PlanIcon, type PlanId } from "@/domain/plans";

export type BillingViewId = "plans" | "compare" | PlanId;

const base = "/app/settings/billing";
export const billingHref: Record<BillingViewId, string> = {
  plans: base,
  compare: `${base}/compare`,
  starter: `${base}/starter`,
  pro: `${base}/pro`,
  business: `${base}/business`,
};

const ease = [0.16, 1, 0.3, 1] as const;

const icons: Record<PlanIcon, ReactNode> = {
  layers: <Layers size={17} aria-hidden="true" />,
  user: <UserRound size={17} aria-hidden="true" />,
  users: <Users size={17} aria-hidden="true" />,
  chart: <ChartNoAxesColumn size={17} aria-hidden="true" />,
  grid: <LayoutGrid size={17} aria-hidden="true" />,
  headset: <Headset size={17} aria-hidden="true" />,
  shield: <ShieldCheck size={17} aria-hidden="true" />,
};

/** Shared motion presets for this section only. Reduced motion: no movement, no stagger. */
function useBillingMotion() {
  const reduced = useReducedMotion() ?? false;
  const grid: Variants = { hidden: {}, show: { transition: { staggerChildren: reduced ? 0 : 0.07, delayChildren: reduced ? 0 : 0.04 } } };
  const item: Variants = reduced
    ? { hidden: { opacity: 1, y: 0, scale: 1 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0 } } }
    : {
        hidden: { opacity: 0, y: 14, scale: 0.985 },
        show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease } },
      };
  const list: Variants = { hidden: {}, show: { transition: { staggerChildren: reduced ? 0 : 0.06, delayChildren: reduced ? 0 : 0.25 } } };
  const row: Variants = reduced
    ? { hidden: { opacity: 1, x: 0 }, show: { opacity: 1, x: 0, transition: { duration: 0 } } }
    : { hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0, transition: { duration: 0.4, ease } } };
  const tick: Variants = reduced
    ? { hidden: { opacity: 1, scale: 1 }, show: { opacity: 1, scale: 1, transition: { duration: 0 } } }
    : { hidden: { opacity: 0, scale: 0.4 }, show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 520, damping: 22, delay: 0.12 } } };
  const lift = reduced ? undefined : { y: -4, transition: { duration: 0.25, ease } };
  const press = reduced ? undefined : { scale: 0.97 };
  return { reduced, grid, item, list, row, tick, lift, press };
}

export function BillingView({ view }: { view: BillingViewId }) {
  const [payments, setPayments] = useState(false);
  const m = useBillingMotion();
  const activate = () => setPayments(true);

  return (
    <>
      <motion.div key={view} className={cn("bl-grid", `bl-grid-${view}`)} variants={m.grid} initial="hidden" animate="show">
        {view === "plans" ? <PlansView /> : view === "compare" ? <CompareView /> : <PlanView id={view} onActivate={activate} />}
      </motion.div>
      <Dialog open={payments} title="Pagamenti in arrivo" onClose={() => setPayments(false)}>
        <p>
          L&apos;attivazione dei piani arriva con i pagamenti online. Per ora nessun addebito e nessuna modifica al tuo workspace: resti sul Piano di
          prova.
        </p>
        <div className="dialog-actions">
          <Button onClick={() => setPayments(false)} autoFocus>
            Ho capito
          </Button>
        </div>
      </Dialog>
    </>
  );
}

/* Building blocks */

function Hero({ eyebrow, title, body, action }: { eyebrow: string; title: string; body: string; action?: ReactNode }) {
  const m = useBillingMotion();
  return (
    <motion.section className="bl-card bl-hero" variants={m.item}>
      <Art name="hero-blocchi" />
      <div className="bl-hero-copy">
        <p className="bl-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="bl-lead">{body}</p>
      </div>
      {action ? <div className="bl-hero-action">{action}</div> : null}
    </motion.section>
  );
}

function Art({ name }: { name: "hero-blocchi" | "pro-sfere" | "business-archi" | "starter-lastre" }) {
  return (
    <picture className="bl-art">
      <source type="image/avif" srcSet={`/plans/${name}-800.avif 800w, /plans/${name}-1400.avif 1400w`} sizes="(min-width: 1280px) 50vw, 100vw" />
      <source type="image/webp" srcSet={`/plans/${name}-800.webp 800w, /plans/${name}-1400.webp 1400w`} sizes="(min-width: 1280px) 50vw, 100vw" />
      <img src={`/plans/${name}-800.webp`} alt="" decoding="async" />
    </picture>
  );
}

function ActionLink({ href, children }: { href: string; children: ReactNode }) {
  const m = useBillingMotion();
  return (
    <motion.span className="bl-btn-wrap" whileHover={m.lift ? { y: -2 } : undefined} whileTap={m.press}>
      <Link href={href} className="bl-btn">
        {children} <ArrowRight size={18} aria-hidden="true" className="bl-btn-arrow" />
      </Link>
    </motion.span>
  );
}

function ActionButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  const m = useBillingMotion();
  return (
    <motion.button type="button" className="bl-btn" onClick={onClick} whileHover={m.lift ? { y: -2 } : undefined} whileTap={m.press}>
      {children} <ArrowRight size={18} aria-hidden="true" className="bl-btn-arrow" />
    </motion.button>
  );
}

const tone: Record<PlanId, string> = { starter: "is-starter", pro: "is-pro", business: "is-business" };
const art: Record<PlanId, "starter-lastre" | "pro-sfere" | "business-archi"> = { starter: "starter-lastre", pro: "pro-sfere", business: "business-archi" };

/** A plan card that links somewhere: the whole card is the link, with the ↗ arrow. */
function PlanCard({
  plan,
  href,
  className,
  children,
}: {
  plan: PlanId;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const m = useBillingMotion();
  return (
    <motion.div className={cn("bl-card bl-plan", tone[plan], className)} variants={m.item} whileHover={m.lift}>
      <Art name={art[plan]} />
      <Link href={href} className="bl-plan-link">
        <span className="bl-plan-copy">{children}</span>
        <ArrowUpRight size={22} aria-hidden="true" className="bl-corner" />
      </Link>
    </motion.div>
  );
}

function Price({ cents }: { cents: number }) {
  return (
    <p className="bl-price">
      <strong>{formatPlanPrice(cents)}</strong> <span>/ mese</span>
    </p>
  );
}

function Soon() {
  return <span className="bl-soon">In arrivo</span>;
}

/* Views */

function PlansView() {
  return (
    <>
      <Hero
        eyebrow="Pricing"
        title="Scegli il piano perfetto per le tue esigenze"
        body="Tutti i piani includono aggiornamenti, assistenza e la massima sicurezza per i tuoi dati."
        action={<ActionLink href={billingHref.compare}>Confronta i piani</ActionLink>}
      />
      {planIds.map((id) => (
        <PlanCard key={id} plan={id} href={billingHref[id]} className={`bl-slot-${id}`}>
          <span className="bl-eyebrow">{plans[id].name}</span>
          <Price cents={plans[id].priceCents} />
          <span className="bl-plan-line">{plans[id].pickerLine}</span>
        </PlanCard>
      ))}
    </>
  );
}

function CompareView() {
  const m = useBillingMotion();
  return (
    <>
      <Hero
        eyebrow="Confronta i piani"
        title="Trova il piano più adatto al tuo lavoro"
        body="Confronta funzionalità, limiti e vantaggi di ogni piano e scegli la soluzione perfetta per te o il tuo team."
      />
      <motion.section className="bl-card bl-compare" variants={m.item} aria-labelledby="bl-compare-title">
        <Link href={billingHref.plans} className="bl-corner-link" aria-label="Torna alla scelta del piano">
          <ArrowUpRight size={22} aria-hidden="true" className="bl-corner" />
        </Link>
        <table>
          <caption id="bl-compare-title" className="bl-sr">
            Confronto delle funzionalità tra Starter, Pro e Business
          </caption>
          <thead>
            <tr>
              <th scope="col" className="bl-compare-feature">
                Funzionalità
              </th>
              {planIds.map((id) => (
                <th key={id} scope="col" className={cn(id === "pro" && "is-pro")}>
                  <Link href={billingHref[id]}>
                    <span className="bl-compare-name">{plans[id].name.replace("Piano ", "")}</span>
                    <span className="bl-compare-price">
                      {formatPlanPrice(plans[id].priceCents)}
                      <small> / mese</small>
                    </span>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <motion.tbody variants={m.list}>
            {compareRows.map((row) => (
              <motion.tr key={row.label} variants={m.row}>
                <th scope="row">
                  <span className="bl-compare-row">
                    {icons[row.icon]}
                    {row.label}
                    {row.soon ? <Soon /> : null}
                  </span>
                </th>
                {planIds.map((id) => (
                  <td key={id} className={cn(id === "pro" && "is-pro")}>
                    {row.included[id] ? (
                      <motion.span className="bl-tick" variants={m.tick}>
                        <Check size={12} strokeWidth={3} aria-hidden="true" />
                        <span className="bl-sr">Incluso</span>
                      </motion.span>
                    ) : (
                      <span className="bl-dash">
                        <Minus size={14} aria-hidden="true" />
                        <span className="bl-sr">Non incluso</span>
                      </span>
                    )}
                  </td>
                ))}
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </motion.section>
      {(["pro", "business"] as const).map((id) => (
        <PlanCard key={id} plan={id} href={billingHref[id]} className="bl-compare-card">
          <span className="bl-plan-title">{plans[id].name}</span>
          <span className="bl-plan-line">{plans[id].compareLine}</span>
        </PlanCard>
      ))}
    </>
  );
}

function PlanView({ id, onActivate }: { id: PlanId; onActivate: () => void }) {
  const plan = plans[id];
  const next = plans[plan.next.plan];
  const m = useBillingMotion();
  return (
    <>
      <Hero eyebrow={plan.eyebrow} title={plan.title} body={plan.body} action={<ActionButton onClick={onActivate}>{plan.cta}</ActionButton>} />
      <PlanCard plan={id} href={billingHref.compare} className="bl-price-card">
        <span className="bl-plan-name">{plan.name}</span>
        <Price cents={plan.priceCents} />
        <span className="bl-plan-line">{plan.priceLine}</span>
      </PlanCard>
      <motion.section className={cn("bl-card bl-includes", tone[id])} variants={m.item} aria-labelledby={`bl-includes-${id}`}>
        <h2 id={`bl-includes-${id}`}>Cosa include</h2>
        <motion.ul variants={m.list}>
          {plan.includes.map((feature) => (
            <motion.li key={feature.label} variants={m.row}>
              <span className="bl-include-ico">{icons[feature.icon]}</span>
              <span className="bl-include-label">
                {feature.label}
                {feature.soon ? <Soon /> : null}
              </span>
              <motion.span className="bl-tick" variants={m.tick}>
                <Check size={12} strokeWidth={3} aria-hidden="true" />
              </motion.span>
            </motion.li>
          ))}
        </motion.ul>
      </motion.section>
      <PlanCard plan={next.id} href={billingHref[next.id]} className="bl-next-card">
        <span className="bl-eyebrow">{plan.next.eyebrow}</span>
        <span className="bl-plan-title is-large">{plan.next.title}</span>
        <span className="bl-plan-line">{plan.next.body}</span>
      </PlanCard>
    </>
  );
}
