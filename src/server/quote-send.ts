import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/db/client";
import { clientContacts, clients, emailDeliveries, quoteEvents, quotePublicLinks, quoteVersions, quotes, user } from "@/db/schema";
import { createId } from "@/domain/ids";
import { defaultMessage, defaultSubject, EMAIL_LIMITS } from "@/domain/quote-email";
import { effectivePlanId, romeCalendarDay } from "@/domain/plans";
import { headlineTotal } from "@/domain/quote-snapshot";
import { asQuoteStatus, nextQuoteStatus, type QuoteStatus } from "@/domain/quote-status";
import { authorize, conflict, invalid, notFound, ok, type Actor, type Result } from "@/server/access";
import { writeAuditLog } from "@/server/audit";
import { emailDeliveryLive } from "@/server/email";
import { getQuoteSendQuota, releaseQuoteSend, reserveQuoteSend, type QuoteSendQuota } from "@/server/quote-send-quota";
import { enqueueJob } from "@/server/outbox";
import { createPublicLink, regeneratePublicLink, revealPublicLinkUrl, revokePublicLink } from "@/server/public-links";
import { freezeQuotePaymentSnapshot } from "@/server/payments";
import { createVersion, findDraft, findQuote, getDraftSnapshot } from "@/server/quotes";

/**
 * Phase 4, PR F2: sending a quote. The client always sees a frozen version on one stable link;
 * "Invia aggiornamento" freezes the current draft into a new version and moves the same link to it.
 */

export const QUOTE_SEND_JOB = "quote.send_email";

const longDate = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });

/** First instant after the validity day, in Rome time. The link works for the whole last day. */
export function linkExpiryFor(validUntil: Date | null): Date | null {
  if (!validUntil) return null;
  const [y, m, d] = romeCalendarDay(validUntil).split("-").map(Number) as [number, number, number];
  const noon = new Date(Date.UTC(y, m - 1, d + 1, 12));
  const romeHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hourCycle: "h23" }).format(noon));
  return new Date(Date.UTC(y, m - 1, d + 1, 0) - (romeHour - 12) * 3_600_000);
}

export type ActiveLink = { id: string; url: string | null; hint: string | null; expiresAt: Date | null };

export type SendContext = {
  quote: { id: string; number: string | null; title: string; status: QuoteStatus };
  isUpdate: boolean;
  sentVersionNo: number | null;
  sentAt: Date | null;
  /** The draft changed after the last version: sending freezes it into version `nextVersionNo`. */
  needsNewVersion: boolean;
  nextVersionNo: number;
  blockedReason: string | null;
  recipient: { name: string | null; email: string | null; clientName: string | null };
  sender: { name: string | null; email: string | null };
  studioName: string;
  totalLabel: string;
  validUntilLabel: string | null;
  brandColor: string;
  defaults: { subject: string; message: string };
  link: ActiveLink | null;
  pdfFilename: string;
  /** False while EMAIL_DRIVER is console or file: emails are only logged. */
  emailLive: boolean;
  /** Daily client-email quota for this sender. Link-only sends do not use it. */
  quota: QuoteSendQuota;
};

async function activeLink(db: AppDatabase, workspaceId: string, quoteId: string) {
  const rows = await db
    .select()
    .from(quotePublicLinks)
    .where(and(eq(quotePublicLinks.workspaceId, workspaceId), eq(quotePublicLinks.quoteId, quoteId), isNull(quotePublicLinks.revokedAt)))
    .orderBy(desc(quotePublicLinks.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

async function latestVersion(db: AppDatabase, workspaceId: string, quoteId: string) {
  const rows = await db
    .select({ id: quoteVersions.id, versionNo: quoteVersions.versionNo, createdAt: quoteVersions.createdAt })
    .from(quoteVersions)
    .where(and(eq(quoteVersions.workspaceId, workspaceId), eq(quoteVersions.quoteId, quoteId)))
    .orderBy(desc(quoteVersions.versionNo))
    .limit(1);
  return rows[0] ?? null;
}

async function versionNoOf(db: AppDatabase, workspaceId: string, versionId: string | null): Promise<number | null> {
  if (!versionId) return null;
  const rows = await db
    .select({ versionNo: quoteVersions.versionNo })
    .from(quoteVersions)
    .where(and(eq(quoteVersions.workspaceId, workspaceId), eq(quoteVersions.id, versionId)));
  return rows[0]?.versionNo ?? null;
}

async function recipientOf(db: AppDatabase, workspaceId: string, clientId: string | null) {
  if (!clientId) return { name: null, email: null, clientName: null };
  const [clientRows, contactRows] = await Promise.all([
    db.select().from(clients).where(and(eq(clients.workspaceId, workspaceId), eq(clients.id, clientId), isNull(clients.deletedAt))),
    db
      .select()
      .from(clientContacts)
      .where(and(eq(clientContacts.workspaceId, workspaceId), eq(clientContacts.clientId, clientId)))
      .orderBy(desc(clientContacts.isPrimary), desc(clientContacts.createdAt)),
  ]);
  const client = clientRows[0];
  if (!client) return { name: null, email: null, clientName: null };
  const contact = contactRows.find((row) => row.email) ?? contactRows[0];
  return {
    name: contact?.name ?? (client.kind === "privato" ? client.name : null),
    email: contact?.email ?? client.email ?? null,
    clientName: client.name,
  };
}

async function senderOf(db: AppDatabase, userId: string) {
  const rows = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, userId));
  return { name: rows[0]?.name ?? null, email: rows[0]?.email ?? null };
}

/** Why sending is not possible right now, or null. */
function blockedReasonFor(quote: { status: string; clientId: string | null; validUntil: Date | null }, now: Date): string | null {
  if (nextQuoteStatus(asQuoteStatus(quote.status), "send", "user") === null) return "Il preventivo è stato accettato: non si può più inviare. Duplicalo per una nuova proposta.";
  if (!quote.clientId) return "Scegli un cliente nei Dettagli prima di inviare.";
  const expiry = linkExpiryFor(quote.validUntil);
  if (expiry && expiry.getTime() <= now.getTime()) return "La validità è scaduta. Aggiorna la data nei Dettagli prima di inviare.";
  return null;
}

export async function getSendContext(db: AppDatabase, actor: Actor, quoteId: string, now = new Date()): Promise<Result<SendContext>> {
  const access = await authorize(db, actor, "quotes.send");
  if (!access.ok) return access;
  const quote = await findQuote(db, actor.workspaceId, quoteId);
  if (!quote) return notFound("Preventivo non trovato.");
  const [draft, latest, link, recipient, sender, snapshot, sentVersionNo] = await Promise.all([
    findDraft(db, actor.workspaceId, quoteId),
    latestVersion(db, actor.workspaceId, quoteId),
    activeLink(db, actor.workspaceId, quoteId),
    recipientOf(db, actor.workspaceId, quote.clientId),
    senderOf(db, actor.userId),
    getDraftSnapshot(db, actor, quoteId),
    versionNoOf(db, actor.workspaceId, quote.sentVersionId),
  ]);
  if (!snapshot.ok) return snapshot;
  const isUpdate = Boolean(quote.sentVersionId);
  const needsNewVersion = !latest || (draft ? draft.updatedAt.getTime() > latest.createdAt.getTime() : false);
  const versionNo = needsNewVersion ? (latest?.versionNo ?? 0) + 1 : latest!.versionNo;
  return ok({
    quote: { id: quote.id, number: quote.number, title: quote.title, status: asQuoteStatus(quote.status) },
    isUpdate,
    sentVersionNo,
    sentAt: quote.sentAt,
    needsNewVersion,
    nextVersionNo: versionNo,
    blockedReason: blockedReasonFor(quote, now),
    recipient,
    sender,
    studioName: snapshot.value.issuer.displayName,
    totalLabel: `${headlineTotal(snapshot.value.totals)} IVA inclusa`,
    validUntilLabel: quote.validUntil ? longDate.format(quote.validUntil) : null,
    brandColor: snapshot.value.brand.colorPrimary,
    defaults: {
      subject: defaultSubject(quote.title, isUpdate),
      message: defaultMessage({ recipientName: recipient.name, title: quote.title, senderName: sender.name, isUpdate }),
    },
    link: link ? { id: link.id, url: await revealPublicLinkUrl(db, actor.workspaceId, link.id), hint: link.tokenHint, expiresAt: link.expiresAt } : null,
    emailLive: emailDeliveryLive(),
    pdfFilename: `${(quote.number ?? "preventivo").replace(/[^\w.-]+/g, "-")}-v${versionNo}.pdf`,
    quota: await getQuoteSendQuota(db, { userId: actor.userId, planId: effectivePlanId(access.value.plan, access.value.planOverride), now }),
  });
}

const emailList = z.array(z.string().trim().toLowerCase().email("Controlla gli indirizzi in copia.").max(254)).max(EMAIL_LIMITS.cc, `Al massimo ${EMAIL_LIMITS.cc} indirizzi in copia.`);

export const sendInputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("email"),
    revision: z.number().int().min(1),
    to: z.string().trim().toLowerCase().email("Scrivi un indirizzo email valido per il cliente.").max(254),
    cc: emailList.default([]),
    subject: z.string().trim().min(1, "Scrivi l'oggetto dell'email.").max(EMAIL_LIMITS.subject, "Oggetto troppo lungo."),
    message: z.string().trim().min(1, "Scrivi un messaggio per il cliente.").max(EMAIL_LIMITS.message, "Messaggio troppo lungo."),
    attachPdf: z.boolean().default(true),
    copyMe: z.boolean().default(false),
  }),
  z.object({ mode: z.literal("link"), revision: z.number().int().min(1) }),
]);

export type SendInput = z.input<typeof sendInputSchema>;

export type SendResult = {
  status: QuoteStatus;
  versionNo: number;
  createdVersion: boolean;
  isUpdate: boolean;
  link: { id: string; url: string | null; created: boolean };
  emailQueued: boolean;
};

async function recordEvent(db: AppDatabase, actor: Actor, quoteId: string, type: string, meta: Record<string, string | number | boolean | null>, versionId: string | null, now: Date) {
  await db.insert(quoteEvents).values({
    id: createId(),
    workspaceId: actor.workspaceId,
    quoteId,
    type,
    actor: "user",
    actorUserId: actor.userId,
    versionId,
    meta: JSON.stringify(meta),
    createdAt: now,
  });
}

/**
 * Sends (or re-sends) a quote. Order matters: version first (it checks the revision the user saw),
 * then the link, then the status, then the email job. Email addresses never go into events or logs.
 */
export async function sendQuote(db: AppDatabase, actor: Actor, quoteId: string, raw: unknown, now = new Date()): Promise<Result<SendResult>> {
  const access = await authorize(db, actor, "quotes.send");
  if (!access.ok) return access;
  const parsed = sendInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Dati di invio non validi.");
  const input = parsed.data;
  const quote = await findQuote(db, actor.workspaceId, quoteId);
  if (!quote) return notFound("Preventivo non trovato.");
  const from = asQuoteStatus(quote.status);
  const blocked = blockedReasonFor(quote, now);
  if (blocked) return conflict(blocked);
  const to = nextQuoteStatus(from, "send", "user");
  if (!to) return conflict("Il preventivo non si può inviare in questo stato.");

  const draft = await findDraft(db, actor.workspaceId, quoteId);
  if (!draft) return notFound("Bozza non trovata.");
  if (draft.revision !== input.revision) return conflict("Ci sono modifiche non ancora salvate o arrivate da un'altra scheda. Attendi il salvataggio e riprova.");

  let reservedDay: string | null = null;
  if (input.mode === "email") {
    const reserved = await reserveQuoteSend(db, {
      userId: actor.userId,
      planId: effectivePlanId(access.value.plan, access.value.planOverride),
      now,
    });
    if (!reserved.ok) return conflict(reserved.message);
    reservedDay = reserved.day;
  }

  let result: Result<SendResult>;
  try {
    result = await performSendQuote(db, actor, quoteId, input, quote, from, to, draft, reservedDay, now);
  } catch (error) {
    if (reservedDay) await releaseQuoteSend(db, { userId: actor.userId, day: reservedDay });
    throw error;
  }
  if (!result.ok && reservedDay) await releaseQuoteSend(db, { userId: actor.userId, day: reservedDay });
  return result;
}

async function performSendQuote(
  db: AppDatabase,
  actor: Actor,
  quoteId: string,
  input: z.infer<typeof sendInputSchema>,
  quote: NonNullable<Awaited<ReturnType<typeof findQuote>>>,
  from: QuoteStatus,
  to: QuoteStatus,
  draft: NonNullable<Awaited<ReturnType<typeof findDraft>>>,
  reservedDay: string | null,
  now: Date,
): Promise<Result<SendResult>> {
  let latest = await latestVersion(db, actor.workspaceId, quoteId);
  let createdVersion = false;
  if (!latest || draft.updatedAt.getTime() > latest.createdAt.getTime()) {
    const created = await createVersion(db, actor, quoteId, input.revision);
    if (!created.ok) return created;
    latest = { id: created.value.id, versionNo: created.value.versionNo, createdAt: now };
    createdVersion = true;
  }

  const expiresAt = linkExpiryFor(quote.validUntil);
  const recipientEmail = input.mode === "email" ? input.to : null;
  const existing = await activeLink(db, actor.workspaceId, quoteId);
  let link: { id: string; url: string | null; created: boolean };
  if (existing) {
    // Same link, new version: validity may have been extended since the last send.
    await db
      .update(quotePublicLinks)
      .set({ expiresAt, recipientEmail: recipientEmail ?? existing.recipientEmail })
      .where(and(eq(quotePublicLinks.workspaceId, actor.workspaceId), eq(quotePublicLinks.id, existing.id)));
    link = { id: existing.id, url: await revealPublicLinkUrl(db, actor.workspaceId, existing.id), created: false };
  } else {
    const created = await createPublicLink(db, { workspaceId: actor.workspaceId, quoteId, createdBy: actor.userId, recipientEmail, expiresAt, now });
    link = { id: created.id, url: created.url, created: true };
    await recordEvent(db, actor, quoteId, "link_created", { linkId: created.id }, latest.id, now);
  }

  const isUpdate = Boolean(quote.sentVersionId);
  const updated = await db
    .update(quotes)
    .set({ status: to, sentVersionId: latest.id, sentAt: now, updatedAt: now })
    .where(and(eq(quotes.workspaceId, actor.workspaceId), eq(quotes.id, quoteId), eq(quotes.status, from)))
    .returning({ id: quotes.id });
  if (updated.length === 0) return conflict("Il preventivo è cambiato nel frattempo. Ricarica la pagina e riprova.");

  let emailQueued = false;
  if (input.mode === "email") {
    const sender = await senderOf(db, actor.userId);
    const snapshot = await getDraftSnapshot(db, actor, quoteId);
    const workspaceEmail = snapshot.ok ? (snapshot.value.issuer.ownerEmail ?? snapshot.value.issuer.email) : null;
    const replyTo = sender.email ?? workspaceEmail ?? null;
    const deliveries: Array<{ to: string; cc: string[]; subject: string; kind: "quote_send" | "quote_send_copy" }> = [
      { to: input.to, cc: input.cc, subject: input.subject, kind: "quote_send" },
    ];
    if (input.copyMe && sender.email) deliveries.push({ to: sender.email, cc: [], subject: `Copia: ${input.subject}`.slice(0, EMAIL_LIMITS.subject + 7), kind: "quote_send_copy" });
    for (const delivery of deliveries) {
      const deliveryId = createId();
      const countsTowardQuota = delivery.kind === "quote_send";
      await db.insert(emailDeliveries).values({
        id: deliveryId,
        workspaceId: actor.workspaceId,
        toAddress: delivery.to,
        subject: delivery.subject,
        templateKey: "quote_send",
        status: "queued",
        quoteId,
        linkId: link.id,
        kind: delivery.kind,
        createdAt: now,
        updatedAt: now,
      });
      await enqueueJob(db, {
        type: QUOTE_SEND_JOB,
        workspaceId: actor.workspaceId,
        now,
        payload: {
          deliveryId,
          workspaceId: actor.workspaceId,
          quoteId,
          versionId: latest.id,
          linkId: link.id,
          to: delivery.to,
          cc: delivery.cc,
          subject: delivery.subject,
          message: input.message,
          attachPdf: input.attachPdf,
          replyTo,
          isUpdate,
          countsTowardQuota,
          quotaDay: countsTowardQuota ? reservedDay : null,
          quotaUserId: countsTowardQuota ? actor.userId : null,
        },
      });
    }
    emailQueued = true;
  }

  await recordEvent(
    db,
    actor,
    quoteId,
    "sent",
    { versionNo: latest.versionNo, mode: input.mode, update: isUpdate, attachPdf: input.mode === "email" ? input.attachPdf : false, linkId: link.id },
    latest.id,
    now,
  );
  await freezeQuotePaymentSnapshot(db, actor.workspaceId, quoteId);
  await writeAuditLog(db, {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action: isUpdate ? "quote.update_sent" : "quote.sent",
    entityType: "quote",
    entityId: quoteId,
    meta: { versionNo: latest.versionNo, mode: input.mode },
  });
  return ok({ status: to, versionNo: latest.versionNo, createdVersion, isUpdate, link, emailQueued });
}

/** URL of the active link for "Copia link". When the key changed, a fresh link replaces the old one. */
export async function copyQuoteLink(db: AppDatabase, actor: Actor, quoteId: string): Promise<Result<{ url: string; regenerated: boolean }>> {
  const access = await authorize(db, actor, "quotes.send");
  if (!access.ok) return access;
  const link = await activeLink(db, actor.workspaceId, quoteId);
  if (!link) return notFound("Questo preventivo non ha un link attivo. Invialo per crearne uno.");
  const url = await revealPublicLinkUrl(db, actor.workspaceId, link.id);
  if (url) return ok({ url, regenerated: false });
  const fresh = await regeneratePublicLink(db, { workspaceId: actor.workspaceId, linkId: link.id, userId: actor.userId });
  if (!fresh) return notFound("Link non trovato.");
  await recordEvent(db, actor, quoteId, "link_regenerated", { linkId: fresh.id, reason: "key" }, null, new Date());
  return ok({ url: fresh.url, regenerated: true });
}

/** New link, the old one stops working at once. Used when a link was forwarded by mistake. */
export async function regenerateQuoteLink(db: AppDatabase, actor: Actor, quoteId: string): Promise<Result<{ url: string }>> {
  const access = await authorize(db, actor, "quotes.send");
  if (!access.ok) return access;
  const link = await activeLink(db, actor.workspaceId, quoteId);
  if (!link) return notFound("Questo preventivo non ha un link attivo.");
  const fresh = await regeneratePublicLink(db, { workspaceId: actor.workspaceId, linkId: link.id, userId: actor.userId });
  if (!fresh) return notFound("Link non trovato.");
  await recordEvent(db, actor, quoteId, "link_regenerated", { linkId: fresh.id, replaces: link.id }, null, new Date());
  await writeAuditLog(db, { workspaceId: actor.workspaceId, actorUserId: actor.userId, action: "quote.link_regenerated", entityType: "quote", entityId: quoteId });
  return ok({ url: fresh.url });
}

/** Stops the link without a replacement. The quote becomes "Revocato" when the state machine allows it. */
export async function revokeQuoteLink(db: AppDatabase, actor: Actor, quoteId: string, now = new Date()): Promise<Result<{ status: QuoteStatus }>> {
  const access = await authorize(db, actor, "quotes.send");
  if (!access.ok) return access;
  const quote = await findQuote(db, actor.workspaceId, quoteId);
  if (!quote) return notFound("Preventivo non trovato.");
  const link = await activeLink(db, actor.workspaceId, quoteId);
  if (!link) return notFound("Questo preventivo non ha un link attivo.");
  const from = asQuoteStatus(quote.status);
  const to = nextQuoteStatus(from, "revoke", "user");
  if (from === "accepted") return conflict("Un preventivo accettato resta consultabile dal cliente.");
  await revokePublicLink(db, { workspaceId: actor.workspaceId, linkId: link.id, revokedBy: actor.userId, now });
  if (to) {
    await db.update(quotes).set({ status: to, updatedAt: now }).where(and(eq(quotes.workspaceId, actor.workspaceId), eq(quotes.id, quoteId), eq(quotes.status, from)));
  }
  await recordEvent(db, actor, quoteId, "link_revoked", { linkId: link.id }, null, now);
  await writeAuditLog(db, { workspaceId: actor.workspaceId, actorUserId: actor.userId, action: "quote.link_revoked", entityType: "quote", entityId: quoteId });
  return ok({ status: to ?? from });
}
