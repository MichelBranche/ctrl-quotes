import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "@/db/client";
import { rateLimits } from "@/db/schema";
import { pruneRateLimits, rateKey, rateRules, TursoRateLimiter, createRateLimiter } from "@/server/rate-limit";
import { createTestDb } from "./helpers/db";

describe("rate limit dei link pubblici", () => {
  let db: AppDatabase;
  const key = randomBytes(32);
  const rule = { name: "test", limit: 3, windowSec: 60 };
  const t0 = Date.UTC(2026, 10, 14, 10, 0, 0);

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("blocca oltre il limite nella stessa finestra", async () => {
    const limiter = new TursoRateLimiter(db, key);
    const results = [];
    for (let i = 0; i < 5; i += 1) results.push(await limiter.hit(rule, "203.0.113.7", t0 + i * 1000));
    expect(results.map((item) => item.ok)).toEqual([true, true, true, false, false]);
    expect(results[0]?.remaining).toBe(2);
    expect(results[4]?.remaining).toBe(0);
    expect(results[0]?.resetAt).toBe(t0 + 60_000);
  });

  it("riparte da capo nella finestra successiva", async () => {
    const limiter = new TursoRateLimiter(db, key);
    for (let i = 0; i < 4; i += 1) await limiter.hit(rule, "203.0.113.7", t0);
    const next = await limiter.hit(rule, "203.0.113.7", t0 + 60_000);
    expect(next.ok).toBe(true);
    expect(next.remaining).toBe(2);
  });

  it("conta separatamente soggetti e regole diverse", async () => {
    const limiter = new TursoRateLimiter(db, key);
    for (let i = 0; i < 3; i += 1) await limiter.hit(rule, "203.0.113.7", t0);
    expect((await limiter.hit(rule, "203.0.113.8", t0)).ok).toBe(true);
    expect((await limiter.hit({ ...rule, name: "altra" }, "203.0.113.7", t0)).ok).toBe(true);
    expect((await limiter.hit(rule, "203.0.113.7", t0)).ok).toBe(false);
  });

  it("regge richieste concorrenti senza perdere conteggi", async () => {
    const limiter = new TursoRateLimiter(db, key);
    const results = await Promise.all(Array.from({ length: 10 }, () => limiter.hit(rule, "198.51.100.1", t0)));
    expect(results.filter((item) => item.ok)).toHaveLength(3);
  });

  it("nel database non finisce l'IP in chiaro", async () => {
    await new TursoRateLimiter(db, key).hit(rule, "203.0.113.7", t0);
    const rows = await db.select().from(rateLimits);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe(rateKey(rule, "203.0.113.7", key));
    expect(JSON.stringify(rows)).not.toContain("203.0.113.7");
  });

  it("la pulizia toglie solo le finestre finite", async () => {
    const limiter = new TursoRateLimiter(db, key);
    await limiter.hit(rule, "a", t0);
    await limiter.hit({ name: "lunga", limit: 5, windowSec: 3600 }, "b", t0);
    expect(await pruneRateLimits(db, t0 + 61_000)).toBe(1);
    expect(await db.select().from(rateLimits)).toHaveLength(1);
  });

  it("regole del piano e scelta del motore", () => {
    expect(rateRules.publicRead).toMatchObject({ limit: 60, windowSec: 60 });
    expect(rateRules.publicWrite).toMatchObject({ limit: 10, windowSec: 600 });
    expect(rateRules.linkWrite).toMatchObject({ limit: 5, windowSec: 3600 });
    expect(rateRules.badToken).toMatchObject({ limit: 20, windowSec: 3600 });
    expect(createRateLimiter(db, {})).toBeInstanceOf(TursoRateLimiter);
    expect(createRateLimiter(db, { UPSTASH_REDIS_REST_URL: "https://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" })).not.toBeInstanceOf(TursoRateLimiter);
  });
});
