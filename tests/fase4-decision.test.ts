import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "@/db/client";
import { notificationPrefs, notifications, outboxJobs, quoteAcceptances, quoteEvents, quotePublicLinks, quotes } from "@/db/schema";
import { createCatalogItem } from "@/server/catalog";
import { createClient } from "@/server/clients";
import type { EmailMessage } from "@/server/email/types";
import { listNotifications, ownerNoticeHandlers } from "@/server/notifications";
import { processDueJobs } from "@/server/outbox";
import { decidePublicQuote } from "@/server/public-decision";
import { recordView } from "@/server/public-quote";
import { revokeQuoteLink, sendQuote } from "@/server/quote-send";
import { createQuote, getQuoteEditor } from "@/server/quotes";
import { createTestDb } from "./helpers/db";
import { ownerWithWorkspace } from "./helpers/actors";
import { blankSignature, inkedSignature } from "./helpers/signature";

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

const signer = {
  signerName: "Luca Ferri",
  signerEmail: "luca@atelier.example",
  consent: true,
};

async function acceptedSigner() {
  return { ...signer, decision: "accepted" as const, signature: await inkedSignature() };
}

describe("accettazione e avvisi al titolare", () => {
  let db: AppDatabase;
  let alpha: { userId: string; workspaceId: string };
  let quoteId: string;
  let token: string;
  const ip = "203.0.113.80";

  beforeEach(async () => {
    process.env.PUBLIC_QUOTE_BASE_URL = "https://ctrl-quotes.vercel.app";
    process.env.NEXT_PUBLIC_APP_URL = "https://ctrl-quotes.vercel.app";
    db = await createTestDb();
    alpha = await ownerWithWorkspace(db, "giulia@example.com", "Studio Alpha");
    const clientId = must(await createClient(db, alpha, { kind: "azienda", name: "Atelier Nord", email: "progetti@atelier.example" })).id;
    const itemId = must(await createCatalogItem(db, alpha, { type: "servizio", name: "Design", unitPriceCents: 120000, taxRateBp: 2200 })).id;
    quoteId = must(await createQuote(db, alpha, { clientId, title: "Nuovo sito web", catalogItemIds: [itemId] })).id;
    const editor = must(await getQuoteEditor(db, alpha, quoteId));
    const sent = must(await sendQuote(db, alpha, quoteId, { mode: "link", revision: editor.revision }));
    token = sent.link.url!.split("/q/")[1]!;
  });

  it("accetta: stato, riga di accettazione, data e avviso in app ed email", async () => {
    const now = new Date("2026-11-14T22:00:00.000Z");
    const result = await decidePublicQuote(db, token, await acceptedSigner(), { ip, userAgent: "Mozilla/5.0" }, now);
    expect(result).toEqual({ ok: true, status: "accepted", decidedAt: now });
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    expect(quote).toMatchObject({ status: "accepted" });
    expect(quote!.decidedAt).toEqual(now);
    const [row] = await db.select().from(quoteAcceptances);
    expect(row).toMatchObject({ decision: "accepted", signerName: "Luca Ferri", signerEmail: "luca@atelier.example" });
    expect(row!.ip).not.toContain(ip);
    expect(row!.ip).toHaveLength(32);
    const events = await db.select().from(quoteEvents).where(eq(quoteEvents.quoteId, quoteId));
    expect(events.some((event) => event.type === "accepted" && event.actor === "recipient")).toBe(true);
    expect(JSON.stringify(events)).not.toContain("luca@atelier.example");
    expect(JSON.stringify(events)).not.toContain(ip);
    const notices = await listNotifications(db, alpha.userId, alpha.workspaceId);
    expect(notices[0]?.type).toBe("quote_accepted");
    expect(notices[0]?.href).toBe(`/app/quotes/${quoteId}`);
    expect(JSON.stringify(notices)).not.toContain("luca@atelier.example");
    const driver = new MemoryDriver();
    await processDueJobs(db, ownerNoticeHandlers(db, driver));
    expect(driver.sent).toHaveLength(1);
    expect(driver.sent[0]!.to).toBe("giulia@example.com");
    expect(driver.sent[0]!.html).toContain("accettato");
    expect(driver.sent[0]!.html).toContain("Apri il preventivo nell'app");
    expect(JSON.stringify(driver.sent)).not.toContain("luca@atelier.example");
  });

  it("rifiuta e avvisa il titolare", async () => {
    const result = await decidePublicQuote(
      db,
      token,
      { ...signer, decision: "rejected", note: "Troppo alto", consent: true },
      { ip, userAgent: "Mozilla/5.0" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe("rejected");
    const [row] = await db.select().from(quoteAcceptances);
    expect(row).toMatchObject({ decision: "rejected", note: "Troppo alto" });
    const notices = await listNotifications(db, alpha.userId, alpha.workspaceId);
    expect(notices[0]?.type).toBe("quote_rejected");
  });

  it("rifiuta link scaduto, revocato o già deciso", async () => {
    await db.update(quotePublicLinks).set({ expiresAt: new Date("2020-01-01T00:00:00Z") });
    const expired = await decidePublicQuote(db, token, await acceptedSigner(), { ip, userAgent: null });
    expect(expired.ok).toBe(false);
    if (expired.ok) return;
    expect(expired.error).toBe("expired");
    await db.update(quotePublicLinks).set({ expiresAt: null });
    await db.update(quotes).set({ status: "pending" }).where(eq(quotes.id, quoteId));
    must(await revokeQuoteLink(db, alpha, quoteId));
    const revoked = await decidePublicQuote(db, token, await acceptedSigner(), { ip, userAgent: null });
    expect(revoked.ok).toBe(false);
    if (revoked.ok) return;
    expect(revoked.error).toBe("revoked");
    const missing = await decidePublicQuote(db, "z".repeat(43), await acceptedSigner(), { ip: "198.51.100.2", userAgent: null });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.error).toBe("invalid");
  });

  it("dopo un'accettazione un secondo tentativo è in conflitto", async () => {
    const first = await decidePublicQuote(db, token, await acceptedSigner(), { ip, userAgent: null });
    expect(first.ok).toBe(true);
    const second = await decidePublicQuote(db, token, { ...signer, decision: "rejected", consent: true }, { ip, userAgent: null });
    expect(second).toMatchObject({ ok: false, error: "conflict" });
    expect(await db.select().from(quoteAcceptances)).toHaveLength(1);
  });

  it("limita i tentativi di scrittura sullo stesso link", async () => {
    let last = { ok: false as const, error: "invalid_input" as const, message: "" };
    for (let i = 0; i < 6; i += 1) {
      last = (await decidePublicQuote(db, token, { decision: "accepted", signerName: "A", signerEmail: "bad", consent: true }, { ip: "198.51.100.40", userAgent: null })) as typeof last;
    }
    expect(last.error).toBe("limited");
  });

  it("all'apertura crea l'avviso in app; senza email se le preferenze lo escludono", async () => {
    await db.insert(notificationPrefs).values({
      userId: alpha.userId,
      workspaceId: alpha.workspaceId,
      emailOnView: "never",
      emailOnDecision: false,
      updatedAt: new Date(),
    });
    expect(await recordView(db, token, { userAgent: "Mozilla/5.0" })).toEqual({ recorded: true, first: true });
    const notices = await listNotifications(db, alpha.userId, alpha.workspaceId);
    expect(notices[0]?.type).toBe("quote_viewed");
    expect(await db.select().from(outboxJobs)).toHaveLength(0);
  });

  it("rifiuta un'accettazione senza firma o con un riquadro vuoto", async () => {
    const missing = await decidePublicQuote(db, token, { ...signer, decision: "accepted" }, { ip, userAgent: null });
    expect(missing).toMatchObject({ ok: false, error: "invalid_input" });
    const empty = await decidePublicQuote(db, token, { ...signer, decision: "accepted", signature: await blankSignature() }, { ip, userAgent: null });
    expect(empty).toMatchObject({ ok: false, error: "invalid_input" });
    expect(await db.select().from(quoteAcceptances)).toHaveLength(0);
  });

  it("salva la firma grafica insieme all'accettazione", async () => {
    const signature = await inkedSignature();
    const result = await decidePublicQuote(db, token, { ...signer, decision: "accepted", signature }, { ip, userAgent: "Mozilla/5.0" });
    expect(result.ok).toBe(true);
    const [row] = await db.select().from(quoteAcceptances);
    expect(row?.signatureAssetId).toBeTruthy();
    expect(row?.signatureSha256).toHaveLength(64);
  });

});
