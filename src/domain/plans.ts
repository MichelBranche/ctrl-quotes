/**
 * Subscription plans shown in Impostazioni > Abbonamento. Copy follows Michel's mockups word for word.
 * `soon: true` marks features that do not exist in the app yet: they stay listed with an "In arrivo" tag
 * (see docs/roadmap-abbonamenti.md). No checkout yet: Stripe arrives in Fase 5.
 */

export const planIds = ["starter", "pro", "business"] as const;
export type PlanId = (typeof planIds)[number];

export type PlanIcon = "layers" | "user" | "users" | "chart" | "grid" | "headset" | "shield" | "send";

export type PlanFeature = { label: string; icon: PlanIcon; soon: boolean };

export type Plan = {
  id: PlanId;
  name: string;
  priceCents: number;
  /** Line under the price on "Scegli il piano". */
  pickerLine: string;
  /** Line under the name on "Confronta i piani" (Pro and Business only in the mockup). */
  compareLine: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  priceLine: string;
  includes: PlanFeature[];
  next: { eyebrow: string; title: string; body: string; plan: PlanId };
};


/** Daily client-email sends allowed for the sender, by effective plan. `null` = unlimited (Business). */
export const quoteSendDailyLimits: Record<PlanId, number | null> = {
  starter: 3,
  pro: 15,
  business: null,
};

export function quoteSendDailyLimit(planId: PlanId): number | null {
  return quoteSendDailyLimits[planId];
}

/** Line shown on plan cards, "Cosa include" and the comparison table. Numbers come from `quoteSendDailyLimits`. */
export function quoteSendDailyLimitLabel(planId: PlanId): string {
  const limit = quoteSendDailyLimits[planId];
  if (limit === null) return "Invii illimitati";
  if (planId === "starter") return `${limit} invii preventivi al giorno`;
  return `${limit} invii al giorno`;
}

export const plans: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Piano Starter",
    priceCents: 900,
    pickerLine: "L’essenziale per creare preventivi professionali.",
    compareLine: "L’essenziale per creare preventivi professionali.",
    eyebrow: "Piano Starter",
    title: "Tutto l’essenziale per iniziare",
    body: "Crea, gestisci e invia preventivi professionali con gli strumenti fondamentali.",
    cta: "Attiva il piano",
    priceLine: "L’opzione ideale per freelancer e professionisti indipendenti.",
    includes: [
      { label: quoteSendDailyLimitLabel("starter"), icon: "send", soon: false },
      { label: "Creazione preventivi", icon: "layers", soon: false },
      { label: "Gestione clienti", icon: "user", soon: false },
      { label: "Report di base", icon: "chart", soon: false },
      { label: "Template standard", icon: "grid", soon: false },
    ],
    next: { eyebrow: "Upgrade", title: "Vuoi di più?", body: "Scopri il Piano Pro e sblocca funzionalità avanzate.", plan: "pro" },
  },
  pro: {
    id: "pro",
    name: "Piano Pro",
    priceCents: 1900,
    pickerLine: "Più invii al giorno e funzionalità per lavorare meglio.",
    compareLine: "Più funzionalità per professionisti e freelancer.",
    eyebrow: "Piano Pro",
    title: "Più potenza per far crescere il tuo lavoro",
    body: "Funzionalità avanzate, maggiore flessibilità e tutti gli strumenti per essere più produttivo.",
    cta: "Attiva il Piano Pro",
    priceLine: "La scelta ideale per professionisti e team in crescita.",
    includes: [
      { label: quoteSendDailyLimitLabel("pro"), icon: "send", soon: false },
      { label: "Tutte le funzionalità Starter", icon: "layers", soon: false },
      { label: "Analytics avanzate", icon: "chart", soon: true },
      { label: "Collaborazione team", icon: "users", soon: true },
      { label: "Template personalizzati", icon: "grid", soon: true },
      { label: "Supporto prioritario", icon: "headset", soon: true },
    ],
    next: { eyebrow: "Upgrade", title: "Vuoi di più?", body: "Passa al Piano Business per massima scalabilità e controllo.", plan: "business" },
  },
  business: {
    id: "business",
    name: "Piano Business",
    priceCents: 4900,
    pickerLine: "La soluzione completa per team e aziende in crescita.",
    compareLine: "La soluzione completa per team e aziende in crescita.",
    eyebrow: "Piano Business",
    title: "La soluzione completa per il tuo team",
    body: "Tutte le funzionalità, massima scalabilità e il pieno controllo per la tua azienda.",
    cta: "Attiva il Piano Business",
    priceLine: "La soluzione completa per team e aziende in crescita.",
    includes: [
      { label: quoteSendDailyLimitLabel("business"), icon: "send", soon: false },
      { label: "Tutte le funzionalità Pro", icon: "layers", soon: false },
      { label: "Utenti illimitati", icon: "users", soon: true },
      { label: "Controlli amministrativi", icon: "chart", soon: true },
      { label: "Sicurezza avanzata", icon: "shield", soon: true },
      { label: "Supporto prioritario 24/7", icon: "headset", soon: true },
    ],
    next: { eyebrow: "Confronta", title: "Vuoi meno?", body: "Scopri il Piano Pro, ideale per professionisti e team.", plan: "pro" },
  },
};

export type CompareRow = {
  label: string;
  icon: PlanIcon;
  included: Record<PlanId, boolean>;
  soon: boolean;
  /** Per-plan text (daily send limits). When set, the table shows the text instead of a tick. */
  values?: Record<PlanId, string>;
};

/** "Confronta i piani" table. The send-limit row reads `quoteSendDailyLimits` through `quoteSendDailyLimitLabel`. */
export const compareRows: CompareRow[] = [
  {
    label: "Invio preventivi",
    icon: "send",
    included: { starter: true, pro: true, business: true },
    soon: false,
    values: {
      starter: quoteSendDailyLimitLabel("starter"),
      pro: quoteSendDailyLimitLabel("pro"),
      business: quoteSendDailyLimitLabel("business"),
    },
  },
  { label: "Creazione preventivi", icon: "layers", included: { starter: true, pro: true, business: true }, soon: false },
  { label: "Template personalizzati", icon: "grid", included: { starter: false, pro: true, business: true }, soon: true },
  { label: "Gestione clienti", icon: "user", included: { starter: true, pro: true, business: true }, soon: false },
  { label: "Collaborazione team", icon: "users", included: { starter: false, pro: true, business: true }, soon: true },
  { label: "Supporto prioritario", icon: "headset", included: { starter: false, pro: false, business: true }, soon: true },
];

export function formatPlanPrice(cents: number): string {
  return `€ ${(cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const DEFAULT_QUOTE_SEND_GLOBAL_DAILY_CAP = 90;
export const BILLING_PATH = "/app/settings/billing";

/**
 * Plan that governs limits and features. An active redeem override wins; otherwise the workspace
 * row is mapped onto starter/pro/business (`free` and unknown values are the standard Starter plan).
 */
export function effectivePlanId(plan: string, override: PlanId | null = null): PlanId {
  if (override) return override;
  if (plan === "pro") return "pro";
  if (plan === "studio") return "business";
  return "starter";
}

/** Calendar day in Europe/Rome, YYYY-MM-DD. The send quota resets at Rome midnight. */
export function romeCalendarDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function globalQuoteSendDailyCap(env: Record<string, string | undefined> = process.env): number {
  const raw = env.QUOTE_SEND_GLOBAL_DAILY_CAP;
  if (raw === undefined || raw === "") return DEFAULT_QUOTE_SEND_GLOBAL_DAILY_CAP;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return DEFAULT_QUOTE_SEND_GLOBAL_DAILY_CAP;
  return value;
}

export const QUOTE_SEND_GLOBAL_CAP_MESSAGE = "Invio temporaneamente non disponibile, riprova domani.";

export function quoteSendLimitReachedMessage(planId: PlanId): string {
  const limit = quoteSendDailyLimits[planId];
  const proLimit = quoteSendDailyLimits.pro;
  if (planId === "starter" && limit !== null && proLimit !== null) {
    return `Hai raggiunto il limite di ${limit} invii al giorno del piano Starter. Passa a Pro per inviarne fino a ${proLimit}.`;
  }
  if (planId === "pro" && limit !== null) {
    return `Hai raggiunto il limite di ${limit} invii al giorno del piano Pro. Passa a Business per invii illimitati.`;
  }
  return "Hai raggiunto il limite di invii giornalieri.";
}

export function quoteSendQuotaLabel(used: number, limit: number | null): string {
  if (limit === null) return "Illimitati";
  return `Invii oggi: ${used} di ${limit}`;
}

/** Label for the workspace's current plan. A plan unlocked by a redeem code wins; "free" is shown as a trial. */
export function currentPlanLabel(plan: string, override: PlanId | null = null): string {
  if (override) return plans[override].name;
  return plan === "free" ? "Piano di prova" : "Piano attivo";
}

/** Every feature still "In arrivo", per plan. Kept in sync with docs/roadmap-abbonamenti.md by a test. */
export function upcomingFeatures(): Record<PlanId, string[]> {
  return {
    starter: plans.starter.includes.filter((item) => item.soon).map((item) => item.label),
    pro: plans.pro.includes.filter((item) => item.soon).map((item) => item.label),
    business: plans.business.includes.filter((item) => item.soon).map((item) => item.label),
  };
}
