"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { billingHref, type BillingViewId } from "@/components/billing/billing-view";

const items: Array<{ id: BillingViewId; label: string }> = [
  { id: "plans", label: "Piani" },
  { id: "compare", label: "Confronta" },
  { id: "starter", label: "Starter" },
  { id: "pro", label: "Pro" },
  { id: "business", label: "Business" },
];

/** In-page pills for the subscription views; the active pill slides between them. */
export function BillingNav({ planLabel }: { planLabel: string }) {
  const pathname = usePathname();
  const reduced = useReducedMotion() ?? false;
  return (
    <div className="bl-top">
      <nav className="bl-pills" aria-label="Sezioni dell'abbonamento">
        {items.map((item) => {
          const active = pathname === billingHref[item.id];
          return (
            <Link key={item.id} href={billingHref[item.id]} aria-current={active ? "page" : undefined} scroll={false}>
              {active ? (
                <motion.span
                  layoutId="bl-pill"
                  className="bl-pill-bg"
                  transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                />
              ) : null}
              <span className="bl-pill-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <p className="bl-current">
        Piano attuale: <strong>{planLabel}</strong>
      </p>
    </div>
  );
}
