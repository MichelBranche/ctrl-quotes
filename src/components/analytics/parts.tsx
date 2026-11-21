import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Lock } from "lucide-react";
import type { PlanId } from "@/domain/plans";
import { cn } from "@/lib/cn";

export function Card({ title, hint, children, className, plan }: { title: string; hint?: string; children: ReactNode; className?: string; plan?: PlanId }) {
  return (
    <section className={cn("card an-card", className)}>
      <header className="an-card-head">
        <div>
          <h2>{title}</h2>
          {hint ? <p>{hint}</p> : null}
        </div>
        {plan && plan !== "starter" ? <span className={cn("an-plan-tag", `is-${plan}`)}>{plan === "pro" ? "Pro" : "Business"}</span> : null}
      </header>
      {children}
    </section>
  );
}

/** Change against the previous period. `lowerIsBetter` flips the colour (response times). */
export function Delta({ value, lowerIsBetter = false, suffix = "%" }: { value: number | null; lowerIsBetter?: boolean; suffix?: string }) {
  if (value == null) return <span className="an-delta is-none">nessun confronto</span>;
  if (value === 0) return <span className="an-delta is-flat">= periodo prec.</span>;
  const good = lowerIsBetter ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("an-delta", good ? "is-good" : "is-bad")}>
      <Icon size={13} aria-hidden="true" />
      {value > 0 ? "+" : ""}
      {value}
      {suffix} vs periodo prec.
    </span>
  );
}

export function Stat({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="an-stat">
      <span className="an-stat-label">{label}</span>
      <strong className="an-stat-value">{value}</strong>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="an-empty">{children}</p>;
}

/** Horizontal bar row: label, bar proportional to max, value on the right. */
export function BarRow({ label, value, ratio, sub }: { label: string; value: string; ratio: number; sub?: string }) {
  return (
    <li className="an-bar-row">
      <div className="an-bar-top">
        <span className="an-bar-label">{label}</span>
        <span className="an-bar-value">{value}</span>
      </div>
      <div className="an-bar-track">
        <span className="an-bar-fill" style={{ width: `${Math.max(2, Math.min(100, ratio * 100))}%` }} />
      </div>
      {sub ? <span className="an-bar-sub">{sub}</span> : null}
    </li>
  );
}

const planName: Record<PlanId, string> = { starter: "Starter", pro: "Pro", business: "Business" };

/** Locked metric: illustrative skeleton (no real data), lock and upgrade CTA. */
export function Locked({ title, body, plan, className }: { title: string; body: string; plan: PlanId; className?: string }) {
  return (
    <section className={cn("card an-card an-locked", className)} aria-label={`${title}, disponibile con ${planName[plan]}`}>
      <header className="an-card-head">
        <div>
          <h2>{title}</h2>
          <p>{body}</p>
        </div>
        <span className={cn("an-plan-tag", `is-${plan}`)}>{planName[plan]}</span>
      </header>
      <div className="an-locked-preview" aria-hidden="true">
        {[64, 92, 48, 78, 36, 84, 58].map((h, i) => (
          <span key={i} style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="an-locked-cta">
        <span className="an-lock"><Lock size={16} aria-hidden="true" /></span>
        <span>Disponibile con il piano {planName[plan]}</span>
        <Link href={`/app/settings/billing/${plan}`} className="btn btn-primary btn-sm an-upgrade">
          Passa a {planName[plan]}
        </Link>
      </div>
    </section>
  );
}
