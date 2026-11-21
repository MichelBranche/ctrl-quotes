import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

export type HealthStatus = { ok: boolean; db: "up" | "down"; latencyMs: number; checkedAt: string };

const TIMEOUT_MS = 3000;

/** Real check: one `select 1` on the database, with a timeout. No data is read. */
export async function checkHealth(): Promise<HealthStatus> {
  const started = Date.now();
  let ok = false;
  try {
    await Promise.race([
      getDb().run(sql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    ok = true;
  } catch {
    ok = false;
  }
  return { ok, db: ok ? "up" : "down", latencyMs: Date.now() - started, checkedAt: new Date().toISOString() };
}
