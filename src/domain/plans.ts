/**
 * Subscription plans shown in Impostazioni > Abbonamento. Copy follows Michel's mockups word for word.
 * `soon: true` marks features that do not exist in the app yet: they stay listed with an "In arrivo" tag
 * (see docs/roadmap-abbonamenti.md). Stripe checkout is gated on STRIPE_SECRET_KEY.
 */

export const planIds = ["starter", "pro", "business"] as const;
export type PlanId = (typeof planIds)[number];

/** Plan whose limits apply during the card-free trial. Change here if the trial offer changes. */
export const TRIAL_PLAN_ID: PlanId = "starter";
/** Length of the free trial, in 24-hour days from the moment it starts. */
export const TRIAL_DURATION_DAYS = 7;
/** Show the in-app banner and send the reminder email when this many days (or fewer) remain. */
export const TRIAL_REMINDER_DAYS_LEFT = 2;
const DAY_MS = 86_400_000;

export function trialDurationMs(days = TRIAL_DURATION_DAYS): number {
  return days * DAY_MS;
}

export function trialEndFrom(start: Date, days = TRIAL_DURATION_DAYS): Date {
  return new Date(start.getTime() + trialDurationMs(days));
}

/** Whole days still to run, rounded up. 0 once the trial has ended. Uses 24-hour periods, not calendar midnights. */
export function trialDaysRemaining(endsAt: Date, now = new Date()): number {
  const ms = endsAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / DAY_MS);
}

export function trialDaysRemainingLabel(days: number): string {
  if (days <= 0) return "Prova terminata";
  if (days === 1) return "Prova gratuita, 1 giorno rimasto";
  return `Prova gratuita, ${days} giorni rimasti`;
}

export function trialReminderDue(endsAt: Date, now = new Date(), reminderDays = TRIAL_REMINDER_DAYS_LEFT): boolean {
  const left = trialDaysRemaining(endsAt, now);
  return left > 0 && left <= reminderDays;
}

export const TRIAL_EXPIRED_WRITE_MESSAGE =
  "La prova gratuita è terminata. Attiva un abbonamento per continuare a modificare i dati.";

const STRIPE_TRIAL_END_BUFFER_MS = 60_000;

/** Unix seconds for Stripe `subscription_data.trial_end`, or undefined when the trial is already over or too close. */
export function stripeSubscriptionTrialEnd(endsAt: Date | null, now = new Date()): number | undefined {
  if (!endsAt) return undefined;
  if (endsAt.getTime() - now.getTime() <= STRIPE_TRIAL_END_BUFFER_MS) return undefined;
  return Math.floor(endsAt.getTime() / 1000);
}


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
/** Members plus pending invites that count toward the plan cap. `null` means unlimited. */
export const teamSeatLimits: Record<PlanId, number | null> = {
  starter: 1,
  pro: 5,
  business: null,
};

/**
 * Seat cap for a workspace. A workspace on the free trial (`plan = "free"`, no redeem override)
 * uses the trial plan cap (Starter). A paid or redeemed plan uses its own cap. Members above the
 * cap are never removed: only new invites are blocked.
 */
export function workspaceTeamSeatLimit(plan: string, override: PlanId | null = null): number | null {
  if (override) return teamSeatLimits[override];
  if (plan === "free") return teamSeatLimits[TRIAL_PLAN_ID];
  return teamSeatLimits[effectivePlanId(plan, override)];
}

/** Marketing line for plan cards, "Cosa include" and the comparison table. Numbers come from `teamSeatLimits`. */
export function teamSeatLimitLabelFromCap(limit: number | null): string {
  if (limit == null) return "Persone illimitate nel workspace, incluse nell'abbonamento";
  if (limit === 1) return "1 persona nel workspace, inclusa nell'abbonamento";
  return `Fino a ${limit} persone nel workspace, incluse nell'abbonamento`;
}

export function teamSeatLimitLabel(id: PlanId): string {
  return teamSeatLimitLabelFromCap(teamSeatLimits[id]);
}

export function teamSeatQuotaLabel(used: number, limit: number | null): string {
  if (limit == null) return `Posti usati: ${used}, illimitati`;
  return `Posti: ${used} di ${limit}`;
}

export function teamSeatLimitReachedMessage(planLabel: string, limit: number): string {
  const seats = limit === 1 ? "1 posto" : `${limit} posti`;
  return `Hai raggiunto il limite di ${seats} del ${planLabel}. Per aggiungerne altri scegli un piano con più posti.`;
}

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
    cta: "Attiva il Piano Starter",
    priceLine: "L’opzione ideale per freelancer e professionisti indipendenti. Sono gli stessi limiti della prova gratuita.",
    includes: [
      { label: quoteSendDailyLimitLabel("starter"), icon: "send", soon: false },
      { label: teamSeatLimitLabel("starter"), icon: "users", soon: false },
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
      { label: "Collaborazione team", icon: "users", soon: false },
      { label: teamSeatLimitLabel("pro"), icon: "users", soon: false },
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
      { label: teamSeatLimitLabel("business"), icon: "users", soon: false },
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
  /** Per-plan text (send limits, seats). When set, the table shows the text instead of a tick. */
  values?: Record<PlanId, string>;
};

/** "Confronta i piani" table. Limit rows read `quoteSendDailyLimits` and `teamSeatLimits` through their label helpers. */
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
  { label: "Collaborazione team", icon: "users", included: { starter: false, pro: true, business: true }, soon: false },
  {
    label: "Persone nel workspace",
    icon: "users",
    included: { starter: true, pro: true, business: true },
    soon: false,
    values: {
      starter: teamSeatLimitLabel("starter"),
      pro: teamSeatLimitLabel("pro"),
      business: teamSeatLimitLabel("business"),
    },
  },
  { label: "Supporto prioritario", icon: "headset", included: { starter: false, pro: false, business: true }, soon: true },
];

export function formatPlanPrice(cents: number): string {
  return `€ ${(cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Paid checkout can be monthly or yearly (12 months at 20% off), for every plan. */
export const billingIntervals = ["monthly", "yearly"] as const;
export type BillingInterval = (typeof billingIntervals)[number];

export function isBillingInterval(value: string): value is BillingInterval {
  return value === "monthly" || value === "yearly";
}

export function billingIntervalLabel(interval: BillingInterval): string {
  return interval === "yearly" ? "Annuale" : "Mensile";
}

/** Yearly total in cents: twelve monthly payments minus 20%, exact integer arithmetic. */
export function yearlyPriceCents(monthlyCents: number): number {
  return (monthlyCents * 12 * 4) / 5;
}

/** Twelve months at the monthly price, before the yearly discount. */
export function yearlyUndiscountedCents(monthlyCents: number): number {
  return monthlyCents * 12;
}

/** Per-month equivalent of a yearly total (yearly cents are always divisible by 12). */
export function yearlyMonthlyEquivalentCents(yearlyCents: number): number {
  return yearlyCents / 12;
}

export const YEARLY_SAVINGS_PERCENT = 20;
export const yearlySavingsLabel = `Risparmi ${YEARLY_SAVINGS_PERCENT}%`;

export const DEFAULT_QUOTE_SEND_GLOBAL_DAILY_CAP = 90;
export const BILLING_PATH = "/app/settings/billing";

  "La prova gratuita è terminata. Attiva un abbonamento per continuare a modificare i dati.";


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
  if (plan === "free") return "Piano di prova";
  return plans[effectivePlanId(plan, override)].name;
}

export type AvatarPlanRing = "starter" | "pro" | "business" | "trial";

const avatarPlanShortName: Record<PlanId, string> = {
  starter: "Starter",
  pro: "Pro",
  business: "Business",
};

/** Ring around the header avatar: trial stays dashed (limits are Starter). Lifetime Business uses the Business ring. */
export function avatarPlanRing(input: {
  trialActive: boolean;
  plan: string;
  planOverride: PlanId | null;
}): AvatarPlanRing {
  if (input.trialActive) return "trial";
  return effectivePlanId(input.plan, input.planOverride);
}

export function avatarPlanTooltip(input: {
  trialActive: boolean;
  trialExpired?: boolean;
  trialDaysLeft: number;
  plan: string;
  planOverride: PlanId | null;
}): string {
  if (input.trialActive) {
    if (input.trialDaysLeft === 1) return "Prova gratuita, 1 giorno";
    return `Prova gratuita, ${input.trialDaysLeft} giorni`;
  }
  if (input.trialExpired && !input.planOverride && input.plan === "free") return "Prova terminata";
  return avatarPlanShortName[effectivePlanId(input.plan, input.planOverride)];
}

/** Every feature still "In arrivo", per plan. Kept in sync with docs/roadmap-abbonamenti.md by a test. */
export function upcomingFeatures(): Record<PlanId, string[]> {
  return {
    starter: plans.starter.includes.filter((item) => item.soon).map((item) => item.label),
    pro: plans.pro.includes.filter((item) => item.soon).map((item) => item.label),
    business: plans.business.includes.filter((item) => item.soon).map((item) => item.label),
  };
}
