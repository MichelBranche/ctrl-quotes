"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export type LandingPlan = {
  id: "starter" | "pro" | "business";
  name: string;
  line: string;
  monthlyCents: number;
  yearlyCents: number | null;
  yearlyFullCents: number | null;
  limits: string[];
  includes: Array<{ label: string; soon: boolean }>;
  note?: string;
};

const euro = (cents: number) =>
  (cents / 100).toLocaleString("it-IT", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });

/** Counts the visible price toward the new value when the billing cycle changes. */
function AnimatedPrice({ cents }: { cents: number }) {
  const [shown, setShown] = useState(cents);
  const from = useRef(cents);
  useEffect(() => {
    const start = from.current;
    if (start === cents) return;
    const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = instant ? 1 : Math.min(1, (now - t0) / 520);
      const eased = 1 - Math.pow(1 - k, 4);
      const value = Math.round(start + (cents - start) * eased);
      setShown(value);
      from.current = value;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cents]);
  return <>{euro(shown)}</>;
}

export function PricingPlans({ plans, ctas, trialLine, savingsLabel }: { plans: LandingPlan[]; ctas: Record<LandingPlan["id"], ReactNode>; trialLine: string; savingsLabel: string }) {
  const [yearly, setYearly] = useState(false);
  return (
    <>
      <div className="lp-price-switch" role="group" aria-label="Ciclo di fatturazione">
        <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)} className={cn(!yearly && "is-on")}>
          Mensile
        </button>
        <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)} className={cn(yearly && "is-on")}>
          Annuale <span className="lp-price-save">{savingsLabel}</span>
        </button>
        <span className="lp-price-thumb" data-yearly={yearly ? "" : undefined} aria-hidden="true" />
      </div>
      <div className="lp-plans">
        {plans.map((plan) => {
          const showYearly = yearly && plan.yearlyCents != null;
          const perMonth = showYearly ? plan.yearlyCents! / 12 : plan.monthlyCents;
          return (
            <article key={plan.id} className={cn("lp-plan", `is-${plan.id}`)} data-reveal="">
              <div className="lp-plan-art" aria-hidden="true" />
              <header className="lp-plan-head">
                <p className="lp-plan-name">
                  {plan.name}
                  {plan.id === "pro" ? <span className="lp-plan-tag">Prova gratuita a questo livello</span> : null}
                </p>
                <p className="lp-plan-line">{plan.line}</p>
              </header>
              <div className="lp-plan-price">
                <span className="lp-plan-currency">€</span>
                <strong>
                  <AnimatedPrice cents={perMonth} />
                </strong>
                <span className="lp-plan-per">/ mese</span>
              </div>
              <p className="lp-plan-year">
                {showYearly ? (
                  <>
                    <s>€ {euro(plan.yearlyFullCents!)}</s> € {euro(plan.yearlyCents!)} all&apos;anno
                  </>
                ) : plan.note ? (
                  plan.note
                ) : (
                  "Pagamento mensile, disdici quando vuoi"
                )}
              </p>
              <ul className="lp-plan-limits">
                {plan.limits.map((limit) => (
                  <li key={limit}>{limit}</li>
                ))}
              </ul>
              <ul className="lp-plan-list">
                {plan.includes.map((item) => (
                  <li key={item.label}>
                    <Check size={16} strokeWidth={3} aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.soon ? <em>In arrivo</em> : null}
                  </li>
                ))}
              </ul>
              <div className="lp-plan-cta">{ctas[plan.id]}</div>
            </article>
          );
        })}
      </div>
      <p className="lp-price-foot">{trialLine}</p>
    </>
  );
}
