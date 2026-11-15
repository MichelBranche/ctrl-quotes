"use client";

import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { SectionLink } from "@/components/motion/section-transition";
import { BillingCycleToggle, billingHref, useBillingCycle, type BillingViewId } from "@/components/billing/billing-view";
import { useAction } from "@/components/data/use-action";
import { startPortalAction } from "@/server/actions/billing";

const items: Array<{ id: BillingViewId; label: string }> = [
  { id: "plans", label: "Piani" },
  { id: "compare", label: "Confronta" },
  { id: "starter", label: "Starter" },
  { id: "pro", label: "Pro" },
  { id: "business", label: "Business" },
];

/** In-page pills for the subscription views; the active pill slides between them. */
export function BillingNav({
  planLabel,
  seatLabel,
  statusLabel,
  intervalLabel,
  renewLabel,
  showYearlySwitch,
}: {
  planLabel: string;
  seatLabel?: string;
  statusLabel?: string;
  intervalLabel?: string;
  renewLabel?: string;
  showYearlySwitch?: boolean;
}) {
  const pathname = usePathname();
  const reduced = useReducedMotion() ?? false;
  const { href } = useBillingCycle();
  const { pending, run } = useAction();
  const switchYearly = () => run(() => startPortalAction(), (value) => {
    window.location.href = value.url;
  });

  return (
    <motion.div
      className="bl-top"
      initial={reduced ? false : { opacity: 0, y: -18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0.2 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="bl-top-left">
        <nav className="bl-pills" aria-label="Sezioni dell'abbonamento">
          {items.map((item) => {
            const active = pathname === billingHref[item.id];
            return (
              <SectionLink key={item.id} href={href(item.id)} aria-current={active ? "page" : undefined} scroll={false}>
                {active ? (
                  <motion.span
                    layoutId="bl-pill"
                    className="bl-pill-bg"
                    transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <span className="bl-pill-label">{item.label}</span>
              </SectionLink>
            );
          })}
        </nav>
        <BillingCycleToggle />
      </div>
      <p className="bl-current">
        Piano attuale: <strong>{planLabel}</strong>
        {intervalLabel ? <span className="bl-current-interval">{intervalLabel}</span> : null}
        {renewLabel ? <span className="bl-current-renew">{renewLabel}</span> : null}
        {seatLabel ? <span className="bl-current-seats">{seatLabel}</span> : null}
        {statusLabel ? <span className="bl-current-status">{statusLabel}</span> : null}
        {showYearlySwitch ? (
          <button type="button" className="bl-switch-year" onClick={switchYearly} disabled={pending}>
            Passa all&apos;annuale
          </button>
        ) : null}
      </p>
    </motion.div>
  );
}
