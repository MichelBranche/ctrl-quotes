import "server-only";
import { count, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { quotes, subscriptions, user, workspaces } from "@/db/schema";
import { workspaceEntitlement } from "@/domain/entitlement";
import type { PaidCheckoutPlanId } from "@/domain/stripe-plans";

export const ECOSYSTEM_METRICS_CACHE_MS = 60_000;

export type EcosystemSignupMonth = { month: string; workspaces: number };

export type EcosystemMetrics = {
  app: "quotes";
  generatedAt: string;
  workspacesAlive: number;
  users: number;
  quotes: number;
  trialsActive: number;
  trialsExpired: number;
  lifetimeOverrides: number;
  stripeSubscriptionsActive: number;
  stripeByPlan: Record<PaidCheckoutPlanId, number>;
  signups: EcosystemSignupMonth[];
};

const EMPTY_BY_PLAN: Record<PaidCheckoutPlanId, number> = { starter: 0, pro: 0, business: 0 };

let cache: { expires: number; data: EcosystemMetrics } | undefined;

/** Last twelve calendar months, inclusive of the current month, as YYYY-MM (UTC). */
export function lastTwelveMonths(now = new Date()): string[] {
  const months: string[] = [];
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

export function fillSignupMonths(rows: { month: string; workspaces: number }[], now = new Date()): EcosystemSignupMonth[] {
  const map = new Map(rows.map((row) => [row.month, row.workspaces]));
  return lastTwelveMonths(now).map((month) => ({ month, workspaces: map.get(month) ?? 0 }));
}

export async function collectEcosystemMetrics(now = new Date()): Promise<EcosystemMetrics> {
  if (cache && cache.expires > now.getTime()) return cache.data;
  const db = getDb();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const monthExpr = sql<string>`strftime('%Y-%m', ${workspaces.createdAt} / 1000, 'unixepoch')`;

  const [workspaceCount, userCount, quoteCount, workspaceRows, monthRows] = await Promise.all([
    db.select({ n: count() }).from(workspaces).where(isNull(workspaces.deletedAt)),
    db.select({ n: count() }).from(user),
    db.select({ n: count() }).from(quotes).where(isNull(quotes.deletedAt)),
    db
      .select({
        plan: workspaces.plan,
        planOverride: workspaces.planOverride,
        planOverrideUntil: workspaces.planOverrideUntil,
        trialEndsAt: workspaces.trialEndsAt,
        subStatus: subscriptions.status,
        subPlan: subscriptions.plan,
        stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      })
      .from(workspaces)
      .leftJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id))
      .where(isNull(workspaces.deletedAt)),
    db
      .select({ month: monthExpr, n: count() })
      .from(workspaces)
      .where(gte(workspaces.createdAt, since))
      .groupBy(monthExpr),
  ]);

  let trialsActive = 0;
  let trialsExpired = 0;
  let lifetimeOverrides = 0;
  const stripeByPlan: Record<PaidCheckoutPlanId, number> = { ...EMPTY_BY_PLAN };
  let stripeSubscriptionsActive = 0;

  for (const row of workspaceRows) {
    const access = workspaceEntitlement({
      plan: row.plan,
      planOverride: row.planOverride,
      planOverrideUntil: row.planOverrideUntil,
      trialEndsAt: row.trialEndsAt,
      subscriptionStatus: row.subStatus,
    }, now);
    if (access.trialActive) trialsActive += 1;
    if (access.trialExpired) trialsExpired += 1;
    if (row.planOverride && row.planOverrideUntil == null) lifetimeOverrides += 1;
    const live = Boolean(
      row.stripeSubscriptionId && row.subStatus && ["active", "trialing", "past_due"].includes(row.subStatus),
    );
    if (live) {
      stripeSubscriptionsActive += 1;
      if (row.subPlan === "starter" || row.subPlan === "pro" || row.subPlan === "business") {
        stripeByPlan[row.subPlan] += 1;
      }
    }
  }

  const data: EcosystemMetrics = {
    app: "quotes",
    generatedAt: now.toISOString(),
    workspacesAlive: Number(workspaceCount[0]?.n ?? 0),
    users: Number(userCount[0]?.n ?? 0),
    quotes: Number(quoteCount[0]?.n ?? 0),
    trialsActive,
    trialsExpired,
    lifetimeOverrides,
    stripeSubscriptionsActive,
    stripeByPlan,
    signups: fillSignupMonths(
      monthRows
        .map((row) => ({ month: String(row.month ?? ""), workspaces: Number(row.n ?? 0) }))
        .filter((row) => /^\d{4}-\d{2}$/.test(row.month)),
      now,
    ),
  };
  cache = { expires: now.getTime() + ECOSYSTEM_METRICS_CACHE_MS, data };
  return data;
}

/** Test helper: drop the in-memory cache. */
export function clearEcosystemMetricsCache(): void {
  cache = undefined;
}
