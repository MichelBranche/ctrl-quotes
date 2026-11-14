import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { quoteSendDailyCounts } from "@/db/schema";
import {
  BILLING_PATH,
  globalQuoteSendDailyCap,
  QUOTE_SEND_GLOBAL_CAP_MESSAGE,
  quoteSendDailyLimit,
  quoteSendLimitReachedMessage,
  romeCalendarDay,
  type PlanId,
} from "@/domain/plans";

const GLOBAL_USER_ID = "";

type QuotaDb = { run: AppDatabase["run"] };

export type QuoteSendQuota = {
  used: number;
  limit: number | null;
  planId: PlanId;
  reached: boolean;
  globalBlocked: boolean;
  message: string | null;
  billingPath: typeof BILLING_PATH;
};

export type ReserveResult =
  | { ok: true; day: string }
  | { ok: false; reason: "user" | "global"; message: string };

async function countOf(
  db: AppDatabase,
  day: string,
  kind: "user" | "global",
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: quoteSendDailyCounts.count })
    .from(quoteSendDailyCounts)
    .where(and(eq(quoteSendDailyCounts.day, day), eq(quoteSendDailyCounts.kind, kind), eq(quoteSendDailyCounts.userId, userId)));
  return row?.count ?? 0;
}

/**
 * Atomically add `delta` if the new total stays within `max` (`null` = no cap).
 * SQLite applies the ON CONFLICT WHERE only on an existing row; a first insert is checked first.
 */
async function tryAdd(
  db: QuotaDb,
  day: string,
  kind: "user" | "global",
  userId: string,
  delta: number,
  max: number | null,
): Promise<boolean> {
  if (delta <= 0) return true;
  if (max !== null && delta > max) return false;
  const cap = max === null ? sql`true` : sql`count + ${delta} <= ${max}`;
  const result = await db.run(sql`
    insert into ${quoteSendDailyCounts} ("day", "kind", "user_id", "count")
    values (${day}, ${kind}, ${userId}, ${delta})
    on conflict("day", "kind", "user_id") do update set "count" = "count" + ${delta}
    where ${cap}
  `);
  return result.rowsAffected === 1;
}

async function trySub(db: QuotaDb, day: string, kind: "user" | "global", userId: string, delta: number): Promise<void> {
  if (delta <= 0) return;
  await db.run(sql`
    update ${quoteSendDailyCounts}
    set "count" = "count" - ${delta}
    where "day" = ${day} and "kind" = ${kind} and "user_id" = ${userId} and "count" >= ${delta}
  `);
}

export async function getQuoteSendQuota(
  db: AppDatabase,
  input: { userId: string; planId: PlanId; now?: Date; env?: Record<string, string | undefined> },
): Promise<QuoteSendQuota> {
  const now = input.now ?? new Date();
  const day = romeCalendarDay(now);
  const limit = quoteSendDailyLimit(input.planId);
  const cap = globalQuoteSendDailyCap(input.env);
  const [used, globalUsed] = await Promise.all([countOf(db, day, "user", input.userId), countOf(db, day, "global", GLOBAL_USER_ID)]);
  const reached = limit !== null && used >= limit;
  const globalBlocked = globalUsed >= cap;
  let message: string | null = null;
  if (globalBlocked) message = QUOTE_SEND_GLOBAL_CAP_MESSAGE;
  else if (reached) message = quoteSendLimitReachedMessage(input.planId);
  return { used, limit, planId: input.planId, reached, globalBlocked, message, billingPath: BILLING_PATH };
}

/** Reserve one client-email send for this user and the global cap, in one transaction. */
export async function reserveQuoteSend(
  db: AppDatabase,
  input: { userId: string; planId: PlanId; now?: Date; env?: Record<string, string | undefined> },
): Promise<ReserveResult> {
  const now = input.now ?? new Date();
  const day = romeCalendarDay(now);
  const limit = quoteSendDailyLimit(input.planId);
  const cap = globalQuoteSendDailyCap(input.env);
  try {
    await db.transaction(async (tx) => {
      const userOk = await tryAdd(tx, day, "user", input.userId, 1, limit);
      if (!userOk) throw new QuotaError("user");
      const globalOk = await tryAdd(tx, day, "global", GLOBAL_USER_ID, 1, cap);
      if (!globalOk) throw new QuotaError("global");
    });
  } catch (error) {
    if (error instanceof QuotaError) {
      const message = error.reason === "global" ? QUOTE_SEND_GLOBAL_CAP_MESSAGE : quoteSendLimitReachedMessage(input.planId);
      return { ok: false, reason: error.reason, message };
    }
    throw error;
  }
  return { ok: true, day };
}

/** Give the reserved slots back when the email is not delivered. */
export async function releaseQuoteSend(db: AppDatabase, input: { userId: string; day: string }): Promise<void> {
  await db.transaction(async (tx) => {
    await trySub(tx, input.day, "user", input.userId, 1);
    await trySub(tx, input.day, "global", GLOBAL_USER_ID, 1);
  });
}

class QuotaError extends Error {
  constructor(readonly reason: "user" | "global") {
    super(reason);
    this.name = "QuotaError";
  }
}
