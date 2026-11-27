"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { ensureMigrated, getDb } from "@/db/client";
import { ownerNoticeHandlers } from "@/server/notifications";
import { processDueJobs } from "@/server/outbox";
import { decidePublicQuote, type DecisionResult } from "@/server/public-decision";
import { clientIp } from "@/server/request-meta";

export async function decidePublicQuoteAction(
  token: unknown,
  input: { decision: "accepted" | "rejected"; signerName: string; signerEmail: string; note?: string; consent: boolean; signature?: string },
): Promise<DecisionResult> {
  await ensureMigrated();
  const clean = typeof token === "string" ? token.slice(0, 64) : "";
  const headerList = await headers();
  const result = await decidePublicQuote(getDb(), clean, input, {
    ip: clientIp(headerList),
    userAgent: headerList.get("user-agent"),
  });
  if (result.ok) {
    after(async () => {
      try {
        await processDueJobs(getDb(), ownerNoticeHandlers(getDb()));
      } catch {
        /* cron will retry */
      }
    });
  }
  return result;
}
