import "server-only";
import { and, count, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb, type AppDatabase } from "@/db/client";
import { quotes, session, subscriptions, user, workspaceMemberships, workspaces } from "@/db/schema";
import {
  classifyWorkspaceAccess,
  primaryAccessStatus,
  toIso,
  type EcosystemAccessStatus,
} from "@/domain/ecosystem-access";
import { workspaceEntitlement } from "@/domain/entitlement";
import type { PlanId } from "@/domain/plans";
import type { PaidCheckoutPlanId } from "@/domain/stripe-plans";

export const ECOSYSTEM_METRICS_CACHE_MS = 60_000;

export type EcosystemSignupMonth = { month: string; workspaces: number };

export type EcosystemMemberRef = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
};

export type EcosystemUserWorkspace = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member";
  status: EcosystemAccessStatus;
  planId: PlanId;
  trialEndsAt: string | null;
};

export type EcosystemUserRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  lastSeenAt: string | null;
  status: EcosystemAccessStatus;
  trialEndsAt: string | null;
  workspaces: EcosystemUserWorkspace[];
};

export type EcosystemWorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  status: EcosystemAccessStatus;
  planId: PlanId;
  trialEndsAt: string | null;
  overrideUntil: string | null;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  quoteCount: number;
  members: EcosystemMemberRef[];
};

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
  userList: EcosystemUserRow[];
  workspaceList: EcosystemWorkspaceRow[];
};

const EMPTY_BY_PLAN: Record<PaidCheckoutPlanId, number> = { starter: 0, pro: 0, business: 0 };

const ROLE_RANK: Record<EcosystemMemberRef["role"], number> = { owner: 0, admin: 1, member: 2 };

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

function asRole(value: string): EcosystemMemberRef["role"] | null {
  return value === "owner" || value === "admin" || value === "member" ? value : null;
}

function sortMembers<T extends { role: EcosystemMemberRef["role"]; name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.name.localeCompare(b.name, "it"));
}

function userTrialEndsAt(
  linked: EcosystemUserWorkspace[],
  status: EcosystemAccessStatus,
): string | null {
  const dates = linked
    .filter((row) => (status === "trial_expired" ? row.status === "trial_expired" : row.status === "trial_active"))
    .map((row) => row.trialEndsAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  if (dates.length === 0) return null;
  return status === "trial_expired" ? dates[dates.length - 1]! : dates[0]!;
}

async function loadDirectory(
  db: AppDatabase,
  workspaceRows: {
    id: string;
    name: string;
    slug: string;
    createdAt: Date;
    plan: string;
    planOverride: string | null;
    planOverrideUntil: Date | null;
    trialEndsAt: Date | null;
    subStatus: string | null;
    subPlan: string | null;
    stripeSubscriptionId: string | null;
    periodEnd: Date | null;
    cancelAtPeriodEnd: boolean | null;
  }[],
  now: Date,
): Promise<{ userList: EcosystemUserRow[]; workspaceList: EcosystemWorkspaceRow[] }> {
  const accessByWorkspace = new Map(
    workspaceRows.map((row) => [
      row.id,
      classifyWorkspaceAccess(
        {
          plan: row.plan,
          planOverride: row.planOverride,
          planOverrideUntil: row.planOverrideUntil,
          trialEndsAt: row.trialEndsAt,
          subscriptionStatus: row.subStatus,
        },
        now,
      ),
    ]),
  );

  const [userRows, lastSeenRows, memberRows, quoteRows] = await Promise.all([
    db.select({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt }).from(user),
    db
      .select({
        userId: session.userId,
        lastSeenAt: sql<number>`max(${session.updatedAt})`,
      })
      .from(session)
      .groupBy(session.userId),
    db
      .select({
        workspaceId: workspaceMemberships.workspaceId,
        userId: workspaceMemberships.userId,
        role: workspaceMemberships.role,
        name: user.name,
        email: user.email,
      })
      .from(workspaceMemberships)
      .innerJoin(user, eq(user.id, workspaceMemberships.userId))
      .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
      .where(isNull(workspaces.deletedAt)),
    db
      .select({ workspaceId: quotes.workspaceId, n: count() })
      .from(quotes)
      .innerJoin(workspaces, eq(quotes.workspaceId, workspaces.id))
      .where(and(isNull(quotes.deletedAt), isNull(workspaces.deletedAt)))
      .groupBy(quotes.workspaceId),
  ]);

  const lastSeen = new Map(lastSeenRows.map((row) => [row.userId, toIso(row.lastSeenAt)]));
  const quoteCount = new Map(quoteRows.map((row) => [row.workspaceId, Number(row.n ?? 0)]));
  const membersByWorkspace = new Map<string, EcosystemMemberRef[]>();
  const workspacesByUser = new Map<string, EcosystemUserWorkspace[]>();
  const workspaceMeta = new Map(workspaceRows.map((row) => [row.id, row]));

  for (const row of memberRows) {
    const role = asRole(row.role);
    const workspace = workspaceMeta.get(row.workspaceId);
    const access = accessByWorkspace.get(row.workspaceId);
    if (!role || !workspace || !access) continue;
    const member: EcosystemMemberRef = { id: row.userId, name: row.name, email: row.email, role };
    const bucket = membersByWorkspace.get(row.workspaceId) ?? [];
    bucket.push(member);
    membersByWorkspace.set(row.workspaceId, bucket);
    const linked = workspacesByUser.get(row.userId) ?? [];
    linked.push({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role,
      status: access.status,
      planId: access.planId,
      trialEndsAt: toIso(access.trialEndsAt),
    });
    workspacesByUser.set(row.userId, linked);
  }

  const workspaceList: EcosystemWorkspaceRow[] = workspaceRows
    .map((row) => {
      const access = accessByWorkspace.get(row.id)!;
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
        status: access.status,
        planId: access.planId,
        trialEndsAt: toIso(access.trialEndsAt),
        overrideUntil: access.status === "redeem" ? toIso(access.overrideUntil) : null,
        subscriptionStatus: row.subStatus,
        subscriptionPlan: row.subPlan,
        periodEnd: toIso(row.periodEnd),
        cancelAtPeriodEnd: Boolean(row.cancelAtPeriodEnd),
        quoteCount: quoteCount.get(row.id) ?? 0,
        members: sortMembers(membersByWorkspace.get(row.id) ?? []),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name, "it"));

  const userList: EcosystemUserRow[] = userRows
    .map((row) => {
      const linked = sortMembers(workspacesByUser.get(row.id) ?? []);
      const status = primaryAccessStatus(linked.map((item) => item.status));
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
        lastSeenAt: lastSeen.get(row.id) ?? null,
        status,
        trialEndsAt: userTrialEndsAt(linked, status),
        workspaces: linked,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name, "it"));

  return { userList, workspaceList };
}

export async function collectEcosystemMetrics(now = new Date(), db?: AppDatabase): Promise<EcosystemMetrics> {
  if (!db && cache && cache.expires > now.getTime()) return cache.data;
  const database = db ?? getDb();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const monthExpr = sql<string>`strftime('%Y-%m', ${workspaces.createdAt} / 1000, 'unixepoch')`;

  const [workspaceCount, userCount, quoteCount, workspaceRows, monthRows] = await Promise.all([
    database.select({ n: count() }).from(workspaces).where(isNull(workspaces.deletedAt)),
    database.select({ n: count() }).from(user),
    database.select({ n: count() }).from(quotes).where(isNull(quotes.deletedAt)),
    database
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        createdAt: workspaces.createdAt,
        plan: workspaces.plan,
        planOverride: workspaces.planOverride,
        planOverrideUntil: workspaces.planOverrideUntil,
        trialEndsAt: workspaces.trialEndsAt,
        subStatus: subscriptions.status,
        subPlan: subscriptions.plan,
        stripeSubscriptionId: subscriptions.stripeSubscriptionId,
        periodEnd: subscriptions.periodEnd,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      })
      .from(workspaces)
      .leftJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id))
      .where(isNull(workspaces.deletedAt)),
    database
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

  const directory = await loadDirectory(database, workspaceRows, now);

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
    userList: directory.userList,
    workspaceList: directory.workspaceList,
  };
  if (!db) cache = { expires: now.getTime() + ECOSYSTEM_METRICS_CACHE_MS, data };
  return data;
}

/** Test helper: drop the in-memory cache. */
export function clearEcosystemMetricsCache(): void {
  cache = undefined;
}
