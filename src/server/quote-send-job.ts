import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/db/client";
import { emailDeliveries, quoteEvents, quoteVersions } from "@/db/schema";
import { createId } from "@/domain/ids";
import { renderQuoteEmail } from "@/domain/quote-email";
import { headlineTotal, type QuoteSnapshot } from "@/domain/quote-snapshot";
import { getEmailDriver } from "@/server/email";
import type { EmailDriver } from "@/server/email/types";
import type { JobAttempt, JobHandler } from "@/server/outbox";
import { revealPublicLinkUrl } from "@/server/public-links";
import { QUOTE_SEND_JOB } from "@/server/quote-send";
import { releaseQuoteSend } from "@/server/quote-send-quota";
import { redact } from "@/server/redact";

const payloadSchema = z.object({
  deliveryId: z.string(),
  workspaceId: z.string(),
  quoteId: z.string(),
  versionId: z.string(),
  linkId: z.string(),
  to: z.string(),
  cc: z.array(z.string()).default([]),
  subject: z.string(),
  message: z.string(),
  attachPdf: z.boolean(),
  replyTo: z.string().nullable(),
  url: z.string().url().optional(),
  isUpdate: z.boolean(),
  countsTowardQuota: z.boolean().optional(),
  quotaDay: z.string().nullable().optional(),
  quotaUserId: z.string().nullable().optional(),
});

const longDate = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });

export type PdfRenderer = (db: AppDatabase, workspaceId: string, snapshot: QuoteSnapshot, versionNo: number, quoteId?: string) => Promise<{ filename: string; content: Buffer }>;

/** Default renderer: the same PDF the editor downloads for a version, with its images. */
const renderVersionPdf: PdfRenderer = async (db, workspaceId, snapshot, versionNo, quoteId) => {
  const [{ renderQuotePdf, pdfFilename }, { loadSnapshotImagesFor }, { loadBillingTermsLine }] = await Promise.all([
    import("@/server/pdf/quote-pdf"),
    import("@/server/quotes"),
    import("@/server/invoicing"),
  ]);
  const images = await loadSnapshotImagesFor(db, workspaceId, snapshot);
  const billingTerms = quoteId ? await loadBillingTermsLine(db, workspaceId, quoteId) : null;
  return { filename: pdfFilename(snapshot, versionNo), content: await renderQuotePdf(snapshot, { images, watermark: null, versionLabel: `v${versionNo}`, billingTerms }) };
};

async function markDelivery(db: AppDatabase, deliveryId: string, status: string, error: string | null) {
  await db.update(emailDeliveries).set({ status, error, updatedAt: new Date() }).where(eq(emailDeliveries.id, deliveryId));
}

export async function deliverQuoteEmail(
  db: AppDatabase,
  raw: unknown,
  attempt: JobAttempt,
  deps: { driver?: EmailDriver; renderPdf?: PdfRenderer } = {},
): Promise<void> {
  const payload = payloadSchema.parse(raw);
  try {
    const rows = await db
      .select({ snapshot: quoteVersions.snapshotJson, versionNo: quoteVersions.versionNo })
      .from(quoteVersions)
      .where(and(eq(quoteVersions.workspaceId, payload.workspaceId), eq(quoteVersions.id, payload.versionId)));
    const version = rows[0];
    if (!version) throw new Error("Versione del preventivo non trovata");
    const snapshot = JSON.parse(version.snapshot) as QuoteSnapshot;
    const url = payload.url ?? (await revealPublicLinkUrl(db, payload.workspaceId, payload.linkId));
    if (!url) throw new Error("Link del preventivo non disponibile: rigeneralo e invia di nuovo");
    const validUntil = snapshot.quote.validUntil ? longDate.format(new Date(snapshot.quote.validUntil)) : null;
    const content = renderQuoteEmail({
      studioName: snapshot.issuer.displayName,
      quoteNumber: snapshot.quote.number,
      quoteTitle: snapshot.quote.title,
      totalLabel: `${headlineTotal(snapshot.totals)} IVA inclusa`,
      validUntilLabel: validUntil,
      message: payload.message,
      url,
      brandColor: snapshot.brand.colorPrimary,
      isUpdate: payload.isUpdate,
    });
    const attachment = payload.attachPdf ? await (deps.renderPdf ?? renderVersionPdf)(db, payload.workspaceId, snapshot, version.versionNo, payload.quoteId) : null;
    await (deps.driver ?? getEmailDriver()).send({
      to: payload.to,
      cc: payload.cc,
      subject: payload.subject,
      text: content.text,
      html: content.html,
      replyTo: payload.replyTo ?? undefined,
      attachments: attachment ? [{ filename: attachment.filename, content: attachment.content, contentType: "application/pdf" }] : undefined,
    });
    await markDelivery(db, payload.deliveryId, "sent", null);
    await db.insert(quoteEvents).values({
      id: createId(),
      workspaceId: payload.workspaceId,
      quoteId: payload.quoteId,
      type: "email_sent",
      actor: "system",
      versionId: payload.versionId,
      meta: JSON.stringify({ deliveryId: payload.deliveryId }),
      createdAt: new Date(),
    });
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : "Errore sconosciuto").slice(0, 300);
    await markDelivery(db, payload.deliveryId, attempt.final ? "failed" : "retrying", message);
    if (attempt.final && payload.countsTowardQuota && payload.quotaDay && payload.quotaUserId) {
      await releaseQuoteSend(db, { userId: payload.quotaUserId, day: payload.quotaDay });
    }
    throw error;
  }
}

export function quoteJobHandlers(db: AppDatabase, deps: { driver?: EmailDriver; renderPdf?: PdfRenderer } = {}): Record<string, JobHandler> {
  return { [QUOTE_SEND_JOB]: (payload, attempt) => deliverQuoteEmail(db, payload, attempt, deps) };
}
