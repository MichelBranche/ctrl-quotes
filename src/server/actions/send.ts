"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { getDb } from "@/db/client";
import { requireContext } from "@/server/context";
import { quoteSendingEnabled } from "@/server/flags";
import { processDueJobs } from "@/server/outbox";
import { copyQuoteLink, getSendContext, regenerateQuoteLink, revokeQuoteLink, sendQuote, type SendContext, type SendResult } from "@/server/quote-send";
import { quoteJobHandlers } from "@/server/quote-send-job";
import { safeLog } from "@/server/redact";
import { toAction, type ActionResult } from "@/server/actions/result";

function id(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 64) : "";
}

const disabled = { ok: false as const, message: "L'invio ai clienti non è ancora attivo." };

export async function getSendContextAction(quoteId: unknown): Promise<ActionResult<SendContext>> {
  if (!quoteSendingEnabled()) return disabled;
  const { db, actor } = await requireContext();
  return toAction(await getSendContext(db, actor, id(quoteId)));
}

export async function sendQuoteAction(quoteId: unknown, input: unknown): Promise<ActionResult<SendResult>> {
  if (!quoteSendingEnabled()) return disabled;
  const { db, actor } = await requireContext();
  const result = await sendQuote(db, actor, id(quoteId), input);
  if (result.ok) {
    if (result.value.emailQueued) {
      // The queue delivers right after the response; the cron picks up anything that fails.
      after(async () => {
        try {
          await processDueJobs(getDb(), quoteJobHandlers(getDb()));
        } catch (error) {
          safeLog("warn", "[quote-send] coda email non completata", { error: error instanceof Error ? error.message : String(error) });
        }
      });
    }
    refresh();
  }
  return toAction(result);
}

export async function copyQuoteLinkAction(quoteId: unknown): Promise<ActionResult<{ url: string; regenerated: boolean }>> {
  if (!quoteSendingEnabled()) return disabled;
  const { db, actor } = await requireContext();
  return toAction(await copyQuoteLink(db, actor, id(quoteId)));
}

export async function regenerateQuoteLinkAction(quoteId: unknown): Promise<ActionResult<{ url: string }>> {
  if (!quoteSendingEnabled()) return disabled;
  const { db, actor } = await requireContext();
  const result = await regenerateQuoteLink(db, actor, id(quoteId));
  return toAction(result, result.ok ? "Nuovo link creato. Quello precedente non funziona più." : undefined);
}

export async function revokeQuoteLinkAction(quoteId: unknown): Promise<ActionResult<{ status: string }>> {
  if (!quoteSendingEnabled()) return disabled;
  const { db, actor } = await requireContext();
  const result = await revokeQuoteLink(db, actor, id(quoteId));
  if (result.ok) refresh();
  return toAction(result, result.ok ? "Link revocato. Il cliente non può più aprire il preventivo." : undefined);
}
