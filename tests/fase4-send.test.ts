import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDatabase } from "@/db/client";
import { auditLogs, emailDeliveries, outboxJobs, quoteEvents, quotePublicLinks, quotes, quoteVersions } from "@/db/schema";
import { createCatalogItem } from "@/server/catalog";
import { createClient } from "@/server/clients";
import { ConsoleEmailDriver, emailDeliveryLive } from "@/server/email";
import type { EmailMessage } from "@/server/email/types";
import { quoteSendingEnabled } from "@/server/flags";
import { processDueJobs } from "@/server/outbox";
import { resolvePublicLink } from "@/server/public-links";
import { copyQuoteLink, getSendContext, linkExpiryFor, regenerateQuoteLink, revokeQuoteLink, sendQuote } from "@/server/quote-send";
import { quoteJobHandlers } from "@/server/quote-send-job";
import { createQuote, getQuoteEditor, saveDraft } from "@/server/quotes";
import { createTestDb } from "./helpers/db";
import { joinAs, ownerWithWorkspace } from "./helpers/actors";

function must<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

class MemoryDriver {
  sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
  }
}

const fakePdf = async () => ({ filename: "Preventivo-v1.pdf", content: Buffer.from("%PDF-1.7 prova") });

describe("invio del preventivo", () => {
  let db: AppDatabase;
  let alpha: { userId: string; workspaceId: string };
  let clientId: string;
  let quoteId: string;

  beforeEach(async () => {
    process.env.PUBLIC_QUOTE_BASE_URL = "https://ctrl-quotes.vercel.app";
    db = await createTestDb();
    alpha = await ownerWithWorkspace(db, "giulia@example.com", "Studio Alpha");
    clientId = must(await createClient(db, alpha, { kind: "azienda", name: "Atelier Nord", email: "progetti@atelier.example" })).id;
    const itemId = must(await createCatalogItem(db, alpha, { type: "servizio", name: "Design", unitPriceCents: 120000, taxRateBp: 2200 })).id;
    quoteId = must(await createQuote(db, alpha, { clientId, title: "Nuovo sito web", catalogItemIds: [itemId] })).id;
  });

  async function revision() {
    return must(await getQuoteEditor(db, alpha, quoteId)).revision;
  }

  async function emailInput(extra: Record<string, unknown> = {}) {
    return { mode: "email", revision: await revision(), to: "progetti@atelier.example", subject: "Il tuo preventivo", message: "Ciao,\necco la proposta.", attachPdf: true, copyMe: false, ...extra };
  }

  it("prepara il contesto: destinatario dal cliente, testi italiani, versione da creare", async () => {
    const context = must(await getSendContext(db, alpha, quoteId));
    expect(context.recipient).toMatchObject({ email: "progetti@atelier.example", clientName: "Atelier Nord" });
    expect(context.isUpdate).toBe(false);
    expect(context.needsNewVersion).toBe(true);
    expect(context.nextVersionNo).toBe(1);
    expect(context.link).toBeNull();
    expect(context.blockedReason).toBeNull();
    expect(context.defaults.subject).toBe("Il tuo preventivo per Nuovo sito web");
    expect(context.defaults.message + context.defaults.subject).not.toContain("\u2014");
    expect(context.emailLive).toBe(false);
  });

  it("invia: crea la versione 1, un link e passa a Inviato; l'email è in coda senza token nel payload", async () => {
    const sent = must(await sendQuote(db, alpha, quoteId, await emailInput()));
    expect(sent).toMatchObject({ status: "pending", versionNo: 1, createdVersion: true, isUpdate: false, emailQueued: true });
    expect(sent.link.url).toMatch(/^https:\/\/ctrl-quotes\.vercel\.app\/q\/[A-Za-z0-9_-]{43}$/);
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    expect(quote).toMatchObject({ status: "pending" });
    expect(quote!.sentVersionId).toBeTruthy();
    const jobs = await db.select().from(outboxJobs);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload).not.toContain(sent.link.url!.split("/q/")[1]);
    const events = await db.select().from(quoteEvents).where(eq(quoteEvents.quoteId, quoteId));
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(["version_created", "link_created", "sent"]));
    expect(JSON.stringify(events)).not.toContain("atelier.example");
    const audit = await db.select().from(auditLogs).where(eq(auditLogs.action, "quote.sent"));
    expect(audit).toHaveLength(1);
    const resolved = await resolvePublicLink(db, sent.link.url!.split("/q/")[1]!, new Date());
    expect(resolved.state).toBe("active");
  });

  it("il link scade alla fine del giorno di validità, ora di Roma", () => {
    expect(linkExpiryFor(new Date("2027-01-12T12:00:00Z"))?.toISOString()).toBe("2027-01-12T23:00:00.000Z");
    expect(linkExpiryFor(new Date("2026-07-10T12:00:00Z"))?.toISOString()).toBe("2026-07-10T22:00:00.000Z");
    expect(linkExpiryFor(null)).toBeNull();
  });

  it("rinvio senza modifiche: stessa versione, stesso link, nessun duplicato", async () => {
    const first = must(await sendQuote(db, alpha, quoteId, { mode: "link", revision: await revision() }));
    const again = must(await sendQuote(db, alpha, quoteId, { mode: "link", revision: await revision() }));
    expect(again).toMatchObject({ versionNo: 1, createdVersion: false, isUpdate: true });
    expect(again.link.id).toBe(first.link.id);
    expect(again.link.created).toBe(false);
    expect(await db.select().from(quoteVersions)).toHaveLength(1);
    expect(await db.select().from(quotePublicLinks)).toHaveLength(1);
    expect(await db.select().from(outboxJobs)).toHaveLength(0);
  });

  it("Invia aggiornamento: la bozza modificata diventa la versione 2 sullo stesso link", async () => {
    const first = must(await sendQuote(db, alpha, quoteId, { mode: "link", revision: await revision() }));
    const editor = must(await getQuoteEditor(db, alpha, quoteId));
    expect(editor.quote.sentVersionId).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 5));
    must(
      await saveDraft(db, alpha, quoteId, {
        revision: editor.revision,
        title: "Nuovo sito web e SEO",
        clientId,
        templateId: "tpl_bold",
        validUntil: editor.quote.validUntil,
        document: editor.document,
      }),
    );
    const context = must(await getSendContext(db, alpha, quoteId));
    expect(context).toMatchObject({ isUpdate: true, needsNewVersion: true, nextVersionNo: 2, sentVersionNo: 1 });
    expect(context.defaults.subject).toBe("Preventivo aggiornato per Nuovo sito web e SEO");
    expect(context.link?.url).toBe(first.link.url);
    const update = must(await sendQuote(db, alpha, quoteId, await emailInput()));
    expect(update).toMatchObject({ versionNo: 2, createdVersion: true, isUpdate: true });
    expect(update.link.id).toBe(first.link.id);
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    const [v2] = await db.select().from(quoteVersions).where(and(eq(quoteVersions.quoteId, quoteId), eq(quoteVersions.versionNo, 2)));
    expect(quote!.sentVersionId).toBe(v2!.id);
  });

  it("rifiuta revisioni vecchie, input non validi e preventivi senza cliente", async () => {
    const stale = await sendQuote(db, alpha, quoteId, { mode: "link", revision: (await revision()) + 1 });
    expect(!stale.ok && stale.error).toBe("conflict");
    const badEmail = await sendQuote(db, alpha, quoteId, await emailInput({ to: "non-una-email" }));
    expect(!badEmail.ok && badEmail.message).toBe("Scrivi un indirizzo email valido per il cliente.");
    const tooManyCc = await sendQuote(db, alpha, quoteId, await emailInput({ cc: ["a@x.it", "b@x.it", "c@x.it", "d@x.it"] }));
    expect(tooManyCc.ok).toBe(false);
    await db.update(quotes).set({ clientId: null }).where(eq(quotes.id, quoteId));
    const noClient = await sendQuote(db, alpha, quoteId, { mode: "link", revision: await revision() });
    expect(!noClient.ok && noClient.message).toContain("Scegli un cliente");
    expect(await db.select().from(quotePublicLinks)).toHaveLength(0);
  });

  it("blocca l'invio di un preventivo accettato o con validità scaduta", async () => {
    await db.update(quotes).set({ validUntil: new Date("2020-01-01T12:00:00Z") }).where(eq(quotes.id, quoteId));
    const expired = await sendQuote(db, alpha, quoteId, { mode: "link", revision: await revision() });
    expect(!expired.ok && expired.message).toContain("validità è scaduta");
    await db.update(quotes).set({ status: "accepted", validUntil: null }).where(eq(quotes.id, quoteId));
    const accepted = await sendQuote(db, alpha, quoteId, { mode: "link", revision: await revision() });
    expect(!accepted.ok && accepted.error).toBe("conflict");
    expect(must(await getQuoteEditor(db, alpha, quoteId)).canSend).toBe(false);
  });

  it("serve il permesso quotes.send: il membro può inviare, un altro workspace non vede nulla", async () => {
    const member = await joinAs(db, alpha.workspaceId, "membro@example.com", "member");
    expect((await sendQuote(db, member, quoteId, { mode: "link", revision: await revision() })).ok).toBe(true);
    const beta = await ownerWithWorkspace(db, "beta@example.com", "Studio Beta");
    const foreign = await sendQuote(db, { userId: beta.userId, workspaceId: beta.workspaceId }, quoteId, { mode: "link", revision: 1 });
    expect(!foreign.ok && foreign.error).toBe("not_found");
    expect((await getSendContext(db, beta, quoteId)).ok).toBe(false);
  });

  it("la coda consegna l'email con link, PDF, Reply-To e copia al mittente", async () => {
    const sent = must(await sendQuote(db, alpha, quoteId, await emailInput({ copyMe: true, cc: ["socio@atelier.example"] })));
    const driver = new MemoryDriver();
    const result = await processDueJobs(db, quoteJobHandlers(db, { driver, renderPdf: fakePdf }));
    expect(result).toMatchObject({ succeeded: 2, failed: 0 });
    expect(driver.sent).toHaveLength(2);
    const [client, copy] = driver.sent;
    expect(client).toMatchObject({ to: "progetti@atelier.example", cc: ["socio@atelier.example"], replyTo: "giulia@example.com", subject: "Il tuo preventivo" });
    expect(client!.text).toContain(sent.link.url!);
    expect(client!.html).toContain(sent.link.url!);
    expect(client!.html).toContain("Apri il preventivo");
    expect(client!.attachments?.[0]).toMatchObject({ filename: "Preventivo-v1.pdf", contentType: "application/pdf" });
    expect(copy).toMatchObject({ to: "giulia@example.com", subject: "Copia: Il tuo preventivo" });
    const deliveries = await db.select().from(emailDeliveries).where(eq(emailDeliveries.quoteId, quoteId));
    expect(deliveries.map((row) => [row.kind, row.status]).sort()).toEqual([
      ["quote_send", "sent"],
      ["quote_send_copy", "sent"],
    ]);
  });

  it("allega il PDF vero della versione inviata", async () => {
    must(await sendQuote(db, alpha, quoteId, await emailInput()));
    const driver = new MemoryDriver();
    await processDueJobs(db, quoteJobHandlers(db, { driver }));
    const attachment = driver.sent[0]!.attachments![0]!;
    expect(attachment.filename).toMatch(/-v1\.pdf$/);
    expect(attachment.content.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("se l'invio fallisce riprova e alla fine segna la consegna come fallita, senza dati personali nell'errore", async () => {
    must(await sendQuote(db, alpha, quoteId, await emailInput({ attachPdf: false })));
    const failing = { send: vi.fn(async () => Promise.reject(new Error("rifiutato per progetti@atelier.example"))) };
    await processDueJobs(db, quoteJobHandlers(db, { driver: failing }));
    let [delivery] = await db.select().from(emailDeliveries);
    expect(delivery!.status).toBe("retrying");
    const [job] = await db.select().from(outboxJobs);
    expect(job!.lastError).not.toContain("atelier.example");
    expect(delivery!.error).not.toContain("atelier.example");
    await db.update(outboxJobs).set({ attempts: 4, nextRunAt: new Date(0) });
    await processDueJobs(db, quoteJobHandlers(db, { driver: failing }));
    [delivery] = await db.select().from(emailDeliveries);
    expect(delivery!.status).toBe("failed");
  });

  it("copia, rigenera e revoca il link; la revoca passa il preventivo a Revocato", async () => {
    const first = must(await sendQuote(db, alpha, quoteId, { mode: "link", revision: await revision() }));
    expect(must(await copyQuoteLink(db, alpha, quoteId))).toEqual({ url: first.link.url, regenerated: false });
    const fresh = must(await regenerateQuoteLink(db, alpha, quoteId));
    expect(fresh.url).not.toBe(first.link.url);
    expect((await resolvePublicLink(db, first.link.url!.split("/q/")[1]!, new Date())).state).toBe("revoked");
    expect(must(await revokeQuoteLink(db, alpha, quoteId)).status).toBe("revoked");
    expect((await resolvePublicLink(db, fresh.url.split("/q/")[1]!, new Date())).state).toBe("revoked");
    expect((await copyQuoteLink(db, alpha, quoteId)).ok).toBe(false);
    const resend = must(await sendQuote(db, alpha, quoteId, { mode: "link", revision: await revision() }));
    expect(resend.link.created).toBe(true);
    expect(resend.status).toBe("pending");
  });
});

describe("flag, driver e modalità prova", () => {
  it("l'invio è spento in produzione finché non c'è la pagina cliente", () => {
    expect(quoteSendingEnabled({ VERCEL_ENV: "production" })).toBe(false);
    expect(quoteSendingEnabled({ VERCEL_ENV: "production", QUOTE_SENDING: "1" })).toBe(true);
    expect(quoteSendingEnabled({ VERCEL_ENV: "preview" })).toBe(true);
    expect(quoteSendingEnabled({})).toBe(true);
    expect(quoteSendingEnabled({ QUOTE_SENDING: "0" })).toBe(false);
  });

  it("le email sono reali solo con Resend configurato", () => {
    expect(emailDeliveryLive({ EMAIL_DRIVER: "console" })).toBe(false);
    expect(emailDeliveryLive({ EMAIL_DRIVER: "resend" })).toBe(false);
    expect(emailDeliveryLive({ EMAIL_DRIVER: "resend", RESEND_API_KEY: "re_x", EMAIL_FROM: "a@b.it" })).toBe(true);
  });

  it("il driver console in produzione non scrive indirizzi né link nei log", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await new ConsoleEmailDriver(true).send({
      to: "progetti@atelier.example",
      subject: "Il tuo preventivo",
      text: "Apri: https://ctrl-quotes.vercel.app/q/Xk3mP9vQ2rAbCdEfGhIjKlMnOpQrStUvWxYz0123f7Lw",
      html: "",
      attachments: [{ filename: "p.pdf", content: Buffer.from("x"), contentType: "application/pdf" }],
    });
    const line = spy.mock.calls.map((call) => call.join(" ")).join("\n");
    spy.mockRestore();
    expect(line).not.toContain("atelier.example");
    expect(line).not.toContain("Xk3mP9vQ2r");
    expect(line).toContain("p.pdf");
  });
});
