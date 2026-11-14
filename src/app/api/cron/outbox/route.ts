import { NextResponse } from "next/server";
import { ensureMigrated, getDb } from "@/db/client";
import { processDueJobs } from "@/server/outbox";
import { quoteJobHandlers } from "@/server/quote-send-job";
import { pruneRateLimits } from "@/server/rate-limit";

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  await ensureMigrated();
  const result = await processDueJobs(getDb(), {
    "email.test": async () => undefined,
    ...quoteJobHandlers(getDb()),
  });
  const prunedRateLimits = await pruneRateLimits(getDb());
  return NextResponse.json({ ...result, prunedRateLimits });
}
