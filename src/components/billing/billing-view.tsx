"use client";

import { useState, type ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { ArrowRight, ArrowUpRight, Check, ChartNoAxesColumn, Headset, Layers, LayoutGrid, Minus, ShieldCheck, UserRound, Users } from "lucide-react";
import { Dialog } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { SectionLink, useMoving, useSectionTransition } from "@/components/motion/section-transition";
import { PlanHeroEffect } from "@/components/billing/effects/billing-effects";
import { RedeemButton } from "@/components/billing/redeem-dialog";
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

/** Where a card comes from (and goes back to): offsets in px. */
type Dir = { x: number; y: number };
const FROM_BOTTOM: Dir = { x: 0, y: 150 };
const FROM_TOP: Dir = { x: 0, y: -140 };
const FROM_RIGHT: Dir = { x: 160, y: 0 };
const FROM_LEFT: Dir = { x: -160, y: 0 };

/**
 * Direction map per view, in grid order. Piani: hero from below, Starter from the right, Pro from above, Business from
 * the right. Confronta: hero from the left, table from above, Pro from below, Business from the right. Single plan:
 * hero from below, price card from the right, "Cosa include" from above, the upgrade/compare card from the right.
 */
const dirs = {
  plans: { hero: FROM_BOTTOM, starter: FROM_RIGHT, pro: FROM_TOP, business: FROM_RIGHT },
  compare: { hero: FROM_LEFT, table: FROM_TOP, pro: FROM_BOTTOM, business: FROM_RIGHT },
  plan: { hero: FROM_BOTTOM, price: FROM_RIGHT, includes: FROM_TOP, next: FROM_RIGHT },
} as const;

const enterSpring = { type: "spring", stiffness: 260, damping: 28, mass: 0.9 } as const;

/** Shared motion presets for this section only. Reduced motion: no sliding, views just switch. */
function useBillingMotion() {
  const reduced = useReducedMotion() ?? false;
  const { leaving } = useSectionTransition();
  const grid: Variants = reduced
    ? { hidden: {}, show: {}, exit: {} }
    : {
        hidden: {},
        show: { transition: { staggerChildren: 0.09, delayChildren: 0.02 } },
        exit: { transition: { staggerChildren: 0.06, staggerDirection: -1 } },
      };
  const item: Variants = reduced
    ? {
        hidden: { opacity: 1, x: 0, y: 0, scale: 1 },
        show: { opacity: 1, x: 0, y: 0, scale: 1, transition: { duration: 0 } },
        exit: { opacity: 1, x: 0, y: 0, scale: 1 },
      }
    : {
        hidden: (dir: Dir = FROM_BOTTOM) => ({ opacity: 0, x: dir.x, y: dir.y, scale: 0.96 }),
        show: { opacity: 1, x: 0, y: 0, scale: 1, transition: { ...enterSpring, opacity: { duration: 0.35, ease } } },
        exit: (dir: Dir = FROM_BOTTOM) => ({ opacity: 0, x: dir.x, y: dir.y, scale: 0.96, transition: { duration: 0.34, ease: [0.55, 0, 0.75, 0.2] } }),
      };
  const list: Variants = { hidden: {}, show: { transition: { staggerChildren: reduced ? 0 : 0.06, delayChildren: reduced ? 0 : 0.35 } } };
  const row: Variants = reduced
    ? { hidden: { opacity: 1, x: 0 }, show: { opacity: 1, x: 0, transition: { duration: 0 } } }
    : { hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0, transition: { duration: 0.4, ease } } };
  const tick: Variants = reduced
    ? { hidden: { opacity: 1, scale: 1 }, show: { opacity: 1, scale: 1, transition: { duration: 0 } } }
    : { hidden: { opacity: 0, scale: 0.4 }, show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 520, damping: 22, delay: 0.12 } } };
  // No hover lift while leaving: the hover gesture would otherwise hold the clicked card in place.
  const lift = reduced || leaving ? undefined : { y: -4, transition: { duration: 0.25, ease } };
  const press = reduced ? undefined : { scale: 0.97 };
  return { reduced, grid, item, list, row, tick, lift, press };
}

export function BillingView({ view }: { view: BillingViewId }) {
  const [payments, setPayments] = useState(false);
  const m = useBillingMotion();
  const { visit, leaving } = useSectionTransition();
  const { moving, settle } = useMoving();
  const activate = () => setPayments(true);

  return (
    <>
      {/* Keyed on the visit: the cards build up again on every arrival, also when Next reveals a route it kept hidden. */}
      <motion.div
        key={`${view}-${visit}`}
        className={cn("bl-grid", `bl-grid-${view}`, leaving && "is-leaving", moving && "is-moving")}
        variants={m.grid}
        initial="hidden"
        animate={leaving ? "exit" : "show"}
        onAnimationComplete={settle}
      >
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

/** Dark hero. On a single plan page (`plan`) it has no 3D artwork: the animated effect fills it (CSS gradient fallback). */
function Hero({ eyebrow, title, body, action, plan, dir }: { eyebrow: string; title: string; body: string; action?: ReactNode; plan?: PlanId; dir: Dir }) {
  const m = useBillingMotion();
  return (
    <motion.section className={cn("bl-card bl-hero", plan && `is-plan is-${plan}`)} variants={m.item} custom={dir}>
      {plan ? <PlanHeroEffect plan={plan} /> : <Art name="hero-blocchi" />}
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
      <SectionLink href={href} className="bl-btn">
        {children} <ArrowRight size={18} aria-hidden="true" className="bl-btn-arrow" />
      </SectionLink>
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
  dir,
}: {
  plan: PlanId;
  href: string;
  className?: string;
  children: ReactNode;
  dir: Dir;
}) {
  const m = useBillingMotion();
  return (
    <motion.div className={cn("bl-card bl-plan", tone[plan], className)} variants={m.item} custom={dir} whileHover={m.lift}>
      <Art name={art[plan]} />
      <SectionLink href={href} className="bl-plan-link">
        <span className="bl-plan-copy">{children}</span>
        <ArrowUpRight size={22} aria-hidden="true" className="bl-corner" />
      </SectionLink>
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
        dir={dirs.plans.hero}
        action={
          <>
            <ActionLink href={billingHref.compare}>Confronta i piani</ActionLink>
            <RedeemButton />
          </>
        }
      />
      {planIds.map((id) => (
        <PlanCard key={id} plan={id} href={billingHref[id]} className={`bl-slot-${id}`} dir={dirs.plans[id]}>
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
        dir={dirs.compare.hero}
      />
      <motion.section className="bl-card bl-compare" variants={m.item} custom={dirs.compare.table} aria-labelledby="bl-compare-title">
        <SectionLink href={billingHref.plans} className="bl-corner-link" aria-label="Torna alla scelta del piano">
          <ArrowUpRight size={22} aria-hidden="true" className="bl-corner" />
        </SectionLink>
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
                  <SectionLink href={billingHref[id]}>
                    <span className="bl-compare-name">{plans[id].name.replace("Piano ", "")}</span>
                    <span className="bl-compare-price">
                      {formatPlanPrice(plans[id].priceCents)}
                      <small> / mese</small>
                    </span>
                  </SectionLink>
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
                    <span className="bl-compare-label">
                      {row.label}
                      {row.soon ? <Soon /> : null}
                    </span>
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
        <PlanCard key={id} plan={id} href={billingHref[id]} className="bl-compare-card" dir={dirs.compare[id]}>
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
      <Hero eyebrow={plan.eyebrow} title={plan.title} body={plan.body} plan={id} dir={dirs.plan.hero} action={<ActionButton onClick={onActivate}>{plan.cta}</ActionButton>} />
      <PlanCard plan={id} href={billingHref.compare} className="bl-price-card" dir={dirs.plan.price}>
        <span className="bl-plan-name">{plan.name}</span>
        <Price cents={plan.priceCents} />
        <span className="bl-plan-line">{plan.priceLine}</span>
      </PlanCard>
      <motion.section className={cn("bl-card bl-includes", tone[id])} variants={m.item} custom={dirs.plan.includes} aria-labelledby={`bl-includes-${id}`}>
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
      <PlanCard plan={next.id} href={billingHref[next.id]} className="bl-next-card" dir={dirs.plan.next}>
        <span className="bl-eyebrow">{plan.next.eyebrow}</span>
        <span className="bl-plan-title is-large">{plan.next.title}</span>
        <span className="bl-plan-line">{plan.next.body}</span>
      </PlanCard>
    </>
  );
}
