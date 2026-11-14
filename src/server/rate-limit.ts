import "server-only";
import { createHmac } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { AppDatabase } from "@/db/client";
import { rateLimits } from "@/db/schema";
import { deriveSubkey } from "@/server/link-token";

/**
 * Rate limits of the public quote endpoints. Fixed windows, keyed by a hash of the subject
 * (IP or link id): no raw IP ever reaches the store. Upstash when configured, otherwise a Turso
 * table, so the feature needs no new service.
 */

export type RateRule = { name: string; limit: number; windowSec: number };

export const rateRules = {
  /** Public page and PDF: per IP. */
  publicRead: { name: "q-read", limit: 60, windowSec: 60 },
  /** Accept, reject, change request: per IP. */
  publicWrite: { name: "q-write", limit: 10, windowSec: 600 },
  /** Same actions, per link. */
  linkWrite: { name: "q-link-write", limit: 5, windowSec: 3600 },
  /** Unknown or malformed tokens: per IP. Slows down guessing. */
  badToken: { name: "q-bad-token", limit: 20, windowSec: 3600 },
  /** Redeem codes: per user. Slows down guessing. */
  redeem: { name: "redeem", limit: 8, windowSec: 600 },
} as const satisfies Record<string, RateRule>;

export type RateResult = { ok: boolean; remaining: number; resetAt: number };

export interface RateLimiter {
  hit(rule: RateRule, subject: string, now?: number): Promise<RateResult>;
}

export function rateKey(rule: RateRule, subject: string, key: Buffer = deriveSubkey("rate")): string {
  const digest = createHmac("sha256", key).update(subject).digest("hex").slice(0, 32);
  return `${rule.name}:${digest}`;
}

export class TursoRateLimiter implements RateLimiter {
  constructor(private readonly db: AppDatabase, private readonly key?: Buffer) {}

  async hit(rule: RateRule, subject: string, now = Date.now()): Promise<RateResult> {
    const windowMs = rule.windowSec * 1000;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetAt = windowStart + windowMs;
    const key = rateKey(rule, subject, this.key);
    // One atomic statement: a new window restarts at 1, the same window adds 1.
    const rows = await this.db
      .insert(rateLimits)
      .values({ key, windowStart, count: 1, expiresAt: resetAt })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`case when ${rateLimits.windowStart} = ${windowStart} then ${rateLimits.count} + 1 else 1 end`,
          windowStart: sql`${windowStart}`,
          expiresAt: sql`${resetAt}`,
        },
      })
      .returning({ count: rateLimits.count });
    const count = rows[0]?.count ?? 1;
    return { ok: count <= rule.limit, remaining: Math.max(0, rule.limit - count), resetAt };
  }
}

class UpstashRateLimiter implements RateLimiter {
  private readonly limiters = new Map<string, Ratelimit>();

  constructor(private readonly redis: Redis) {}

  async hit(rule: RateRule, subject: string): Promise<RateResult> {
    let limiter = this.limiters.get(rule.name);
    if (!limiter) {
      limiter = new Ratelimit({
        redis: this.redis,
        limiter: Ratelimit.fixedWindow(rule.limit, `${rule.windowSec} s`),
        prefix: "cq-rl",
      });
      this.limiters.set(rule.name, limiter);
    }
    const result = await limiter.limit(rateKey(rule, subject));
    return { ok: result.success, remaining: result.remaining, resetAt: result.reset };
  }
}

export function createRateLimiter(db: AppDatabase, env: Record<string, string | undefined> = process.env): RateLimiter {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new UpstashRateLimiter(new Redis({ url, token }));
  return new TursoRateLimiter(db);
}

/** Drops finished windows. Called by the cron. */
export async function pruneRateLimits(db: AppDatabase, now = Date.now()): Promise<number> {
  const deleted = await db.delete(rateLimits).where(lt(rateLimits.expiresAt, now)).returning({ key: rateLimits.key });
  return deleted.length;
}
