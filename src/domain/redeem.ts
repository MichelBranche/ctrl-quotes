import { planIds, type PlanId } from "@/domain/plans";

/** Redeem codes: a free period (N days) or a lifetime unlock of a plan, applied to the workspace as an override. */

export const redeemKinds = ["free_month", "lifetime"] as const;
export type RedeemKind = (typeof redeemKinds)[number];

export type RedeemError = "invalid" | "expired" | "used" | "exhausted" | "lifetime_active" | "forbidden" | "rate_limited";

export type RedeemSuccess = { plan: PlanId; kind: RedeemKind; days: number | null; until: number | null };

export const redeemErrorMessages: Record<RedeemError, string> = {
  invalid: "Codice non valido. Controlla di averlo scritto bene.",
  expired: "Questo codice è scaduto.",
  used: "Hai già usato questo codice.",
  exhausted: "Questo codice ha raggiunto il numero massimo di utilizzi.",
  lifetime_active: "Il workspace ha già un piano a vita: questo codice non aggiungerebbe nulla.",
  forbidden: "Solo proprietari e amministratori possono riscattare codici per il workspace.",
  rate_limited: "Troppi tentativi. Riprova tra qualche minuto.",
};

const MAX_CODE_LENGTH = 40;

/** Case-insensitive: the raw code is uppercased and stripped of spaces, then hashed before storage or lookup. Null when clearly not a code. */
export function normalizeRedeemCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.replace(/\s+/g, "").toUpperCase();
  if (code.length < 4 || code.length > MAX_CODE_LENGTH || !/^[A-Z0-9-]+$/.test(code)) return null;
  return code;
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (planIds as readonly string[]).includes(value);
}

/** The override still in force at `now`, or null. Until null = lifetime. */
export function activePlanOverride(override: string | null, until: Date | number | null, now = Date.now()): PlanId | null {
  if (!isPlanId(override)) return null;
  if (until === null) return override;
  const end = typeof until === "number" ? until : until.getTime();
  return end > now ? override : null;
}

const DAY_MS = 86_400_000;

/**
 * New override after redeeming. Lifetime replaces anything. A free period of the same plan still running is
 * extended; otherwise it starts now. An active lifetime override is never shortened (caller returns lifetime_active).
 */
export function nextOverride(
  current: { plan: PlanId | null; until: number | null },
  code: { kind: RedeemKind; plan: PlanId; days: number | null },
  now: number,
): { plan: PlanId; until: number | null } {
  if (code.kind === "lifetime") return { plan: code.plan, until: null };
  const from = current.plan === code.plan && current.until !== null && current.until > now ? current.until : now;
  return { plan: code.plan, until: from + (code.days ?? 30) * DAY_MS };
}
