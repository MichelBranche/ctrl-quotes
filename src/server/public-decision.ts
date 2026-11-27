import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/db/client";
import { assetBlobs, assets, quoteAcceptances, quoteEvents, quotes, quoteVersions } from "@/db/schema";
import { createId } from "@/domain/ids";
import { parseSignatureDataUrl } from "@/domain/signature";
import { canonicalJson, headlineTotal, type QuoteSnapshot } from "@/domain/quote-snapshot";
import { ACCEPT_CONSENT } from "@/domain/quote-consent";
import { isOpenForClient, nextQuoteStatus, type QuoteStatus } from "@/domain/quote-status";
import { notifyQuoteOwner } from "@/server/notifications";
import { resolvePublicLink } from "@/server/public-links";
import { loadSentVersion } from "@/server/public-quote";
import { createRateLimiter, rateRules } from "@/server/rate-limit";

export type DecisionError = "invalid" | "limited" | "expired" | "revoked" | "conflict" | "invalid_input";

export type DecisionResult =
  | { ok: true; status: QuoteStatus; decidedAt: Date }
  | { ok: false; error: DecisionError; message: string };

const inputSchema = z.object({
  decision: z.enum(["accepted", "rejected"]),
  signerName: z.string().trim().min(2, "Scrivi il nome e il cognome.").max(80),
  signerEmail: z.string().trim().toLowerCase().email("Scrivi un indirizzo email valido.").max(254),
  note: z.string().trim().max(1000).optional(),
  consent: z.boolean(),
  signature: z.string().optional(),
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function consentText(decision: "accepted" | "rejected", snapshot: QuoteSnapshot): string {
  const label = [snapshot.quote.number, snapshot.quote.title].filter(Boolean).join(" · ");
  const total = headlineTotal(snapshot.totals);
  if (decision === "accepted") {
    return `${ACCEPT_CONSENT} Preventivo ${label}, totale ${total} IVA inclusa.`;
  }
  return `Confermo di rifiutare il preventivo ${label}, totale ${total} IVA inclusa.`;
}

function termsSource(snapshot: QuoteSnapshot): string {
  const blocks = snapshot.document.blocks.filter((block) => block.type === "terms");
  return canonicalJson(blocks.length > 0 ? blocks : snapshot.fiscal);
}

/**
 * Accept or decline a quote from the public link. Rate limited per IP and per link.
 * Expiry and revocation are enforced via resolvePublicLink. The signer email is stored
 * only on the acceptance row, never in events or notifications.
 */
export async function decidePublicQuote(
  db: AppDatabase,
  token: string,
  raw: unknown,
  meta: { ip: string; userAgent: string | null },
  now = new Date(),
): Promise<DecisionResult> {
  const limiter = createRateLimiter(db);
  if (!(await limiter.hit(rateRules.publicWrite, meta.ip, now.getTime())).ok) {
    return { ok: false, error: "limited", message: "Troppe richieste. Riprova tra qualche minuto." };
  }
  if (!(await limiter.hit(rateRules.linkWrite, token, now.getTime())).ok) {
    return { ok: false, error: "limited", message: "Troppe richieste su questo link. Riprova più tardi." };
  }
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input", message: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const input = parsed.data;
  if (input.decision === "accepted" && !input.consent) {
    return { ok: false, error: "invalid_input", message: "Per accettare devi confermare di aver letto il preventivo." };
  }
  const resolved = await resolvePublicLink(db, token, now);
  if (resolved.state === "invalid") return { ok: false, error: "invalid", message: "Questo link non è più attivo." };
  if (resolved.state === "revoked") return { ok: false, error: "revoked", message: "Questo link è stato ritirato." };
  if (resolved.state === "expired") return { ok: false, error: "expired", message: "Questo preventivo è scaduto." };
  if (!isOpenForClient(resolved.quote.status)) {
    if (resolved.quote.status === "accepted") return { ok: false, error: "conflict", message: "Questo preventivo è già stato accettato." };
    if (resolved.quote.status === "rejected") return { ok: false, error: "conflict", message: "Questo preventivo è già stato rifiutato." };
    return { ok: false, error: "conflict", message: "Questo preventivo non si può più decidere." };
  }

  const sent = await loadSentVersion(db, resolved.quote.workspaceId, resolved.quote.sentVersionId);
  if (!sent || !resolved.quote.sentVersionId) return { ok: false, error: "invalid", message: "Questo link non è più attivo." };

  let signatureAssetId: string | null = null;
  let signatureSha256: string | null = null;
  let signatureBytes: Buffer | null = null;
  if (input.decision === "accepted") {
    const signature = await parseSignatureDataUrl(input.signature);
    if (!signature.ok) return { ok: false, error: "invalid_input", message: signature.message };
    signatureSha256 = signature.sha256;
    signatureBytes = signature.bytes;
  }

  const transition = input.decision === "accepted" ? "accept" : "reject";
  const to = nextQuoteStatus(resolved.quote.status, transition, "recipient");
  if (!to) return { ok: false, error: "conflict", message: "Questo preventivo non si può più decidere." };

  const versionRows = await db
    .select({ sha: quoteVersions.snapshotSha256 })
    .from(quoteVersions)
    .where(and(eq(quoteVersions.workspaceId, resolved.quote.workspaceId), eq(quoteVersions.id, resolved.quote.sentVersionId)));
  const snapshotSha = versionRows[0]?.sha ?? sha256(canonicalJson(sent.snapshot));
  const idempotencyKey = sha256(`${resolved.link.id}:${resolved.quote.sentVersionId}:${input.decision}`);

  if (signatureBytes && signatureSha256) {
    signatureAssetId = createId();
    await db.insert(assets).values({
      id: signatureAssetId,
      workspaceId: resolved.quote.workspaceId,
      blobKey: `db:${signatureAssetId}`,
      sha256: signatureSha256,
      mime: "image/png",
      sizeBytes: signatureBytes.length,
      filename: "firma-preventivo.png",
      createdAt: now,
    });
    await db.insert(assetBlobs).values({
      workspaceId: resolved.quote.workspaceId,
      assetId: signatureAssetId,
      data: signatureBytes,
    });
  }

  try {
    await db.insert(quoteAcceptances).values({
      id: createId(),
      workspaceId: resolved.quote.workspaceId,
      quoteId: resolved.quote.id,
      decision: input.decision,
      versionId: resolved.quote.sentVersionId,
      signerName: input.signerName,
      signerEmail: input.signerEmail,
      optionsJson: "[]",
      totalsSha256: sha256(canonicalJson(sent.snapshot.totals)),
      termsSha256: sha256(termsSource(sent.snapshot)),
      consentText: consentText(input.decision, sent.snapshot),
      ip: sha256(meta.ip).slice(0, 32),
      userAgent: (meta.userAgent ?? "").slice(0, 300) || null,
      idempotencyKey,
      createdAt: now,
      linkId: resolved.link.id,
      snapshotSha256: snapshotSha,
      note: input.decision === "rejected" ? (input.note || null) : null,
      signatureAssetId,
      signatureSha256,
    });
  } catch {
    return { ok: false, error: "conflict", message: "Questo preventivo è già stato deciso." };
  }

  const updated = await db
    .update(quotes)
    .set({ status: to, decidedAt: now, updatedAt: now })
    .where(
      and(
        eq(quotes.workspaceId, resolved.quote.workspaceId),
        eq(quotes.id, resolved.quote.id),
        eq(quotes.status, resolved.quote.status),
      ),
    )
    .returning({ id: quotes.id });
  if (updated.length === 0) {
    return { ok: false, error: "conflict", message: "Questo preventivo è già stato deciso." };
  }

  const eventId = createId();
  await db.insert(quoteEvents).values({
    id: eventId,
    workspaceId: resolved.quote.workspaceId,
    quoteId: resolved.quote.id,
    type: input.decision === "accepted" ? "accepted" : "rejected",
    actor: "recipient",
    versionId: resolved.quote.sentVersionId,
    meta: JSON.stringify({ linkId: resolved.link.id }),
    createdAt: now,
  });
  await notifyQuoteOwner(db, {
    workspaceId: resolved.quote.workspaceId,
    quoteId: resolved.quote.id,
    eventId,
    type: input.decision === "accepted" ? "quote_accepted" : "quote_rejected",
    studioName: sent.snapshot.issuer.displayName,
  });
  return { ok: true, status: to, decidedAt: now };
}
