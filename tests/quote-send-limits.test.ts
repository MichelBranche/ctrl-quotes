import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDatabase } from "@/db/client";
import { outboxJobs, workspaces } from "@/db/schema";
import { quoteSendLimitReachedMessage, QUOTE_SEND_GLOBAL_CAP_MESSAGE, quoteSendQuotaLabel, TRIAL_EXPIRED_WRITE_MESSAGE } from "@/domain/plans";
import type { PlanId } from "@/domain/plans";
import { createCatalogItem } from "@/server/catalog";
import { createClient } from "@/server/clients";
import { processDueJobs } from "@/server/outbox";
import { getSendContext, sendQuote } from "@/server/quote-send";
import { quoteJobHandlers } from "@/server/quote-send-job";
import { getQuoteSendQuota, releaseQuoteSend, reserveQuoteSend } from "@/server/quote-send-quota";
import { createQuote, getQuoteEditor } from "@/server/quotes";
import { createTestDb } from "./helpers/db";
import { joinAs, ownerWithWorkspace } from "./helpers/actors";

function must<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

const noonRome = new Date("2026-11-14T11:00:00Z");

describe("limite giornaliero di invio preventivi", () => {
  let db: AppDatabase;
  let alpha: { userId: string; workspaceId: string };
  let quoteId: string;

  beforeEach(async () => {
    process.env.PUBLIC_QUOTE_BASE_URL = "https://quotes.ctrlagency.dev";
    delete process.env.QUOTE_SEND_GLOBAL_DAILY_CAP;
    db = await createTestDb();
    alpha = await ownerWithWorkspace(db, "giulia@example.com", "Studio Alpha");
    const clientId = must(await createClient(db, alpha, { kind: "azienda", name: "Atelier Nord", email: "progetti@atelier.example" })).id;
    const itemId = must(await createCatalogItem(db, alpha, { type: "servizio", name: "Design", unitPriceCents: 120000, taxRateBp: 2200 })).id;
    quoteId = must(await createQuote(db, alpha, { clientId, title: "Nuovo sito web", catalogItemIds: [itemId] })).id;
  });

  async function emailInput() {
    const revision = must(await getQuoteEditor(db, alpha, quoteId)).revision;
    return { mode: "email" as const, revision, to: "progetti@atelier.example", subject: "Il tuo preventivo", message: "Ciao, ecco la proposta.", attachPdf: false, copyMe: false };
  }

  async function setOverride(plan: PlanId) {
    await db.update(workspaces).set({ planOverride: plan, planOverrideUntil: null }).where(eq(workspaces.id, alpha.workspaceId));
  }

  it("durante la prova gratuita usa i limiti Pro (15 invii al giorno)", async () => {
    const context = must(await getSendContext(db, alpha, quoteId, noonRome));
    expect(context.quota).toMatchObject({ used: 0, limit: 15, planId: "pro", reached: false, globalBlocked: false });
    expect(quoteSendQuotaLabel(context.quota.used, context.quota.limit)).toBe("Invii oggi: 0 di 15");
  });

  it("un override Starter resta a 3 invii al giorno", async () => {
    await setOverride("starter");
    const context = must(await getSendContext(db, alpha, quoteId, noonRome));
    expect(context.quota).toMatchObject({ used: 0, limit: 3, planId: "starter", reached: false });
    expect(quoteSendQuotaLabel(context.quota.used, context.quota.limit)).toBe("Invii oggi: 0 di 3");
  });

  it("a prova scaduta non si può più inviare", async () => {
    await db.update(workspaces).set({ trialEndsAt: new Date("2026-01-01T00:00:00.000Z") }).where(eq(workspaces.id, alpha.workspaceId));
    const blocked = await sendQuote(db, alpha, quoteId, await emailInput(), noonRome);
    expect(blocked).toMatchObject({ ok: false, message: TRIAL_EXPIRED_WRITE_MESSAGE });
  });

  it("sul piano Pro ammette 15 invii al giorno", async () => {
    await setOverride("pro");
    for (let i = 0; i < 15; i += 1) {
      const reserved = await reserveQuoteSend(db, { userId: alpha.userId, planId: "pro", now: noonRome });
      expect(reserved.ok).toBe(true);
    }
    const quota = await getQuoteSendQuota(db, { userId: alpha.userId, planId: "pro", now: noonRome });
    expect(quota).toMatchObject({ used: 15, limit: 15, reached: true });
    const blocked = await reserveQuoteSend(db, { userId: alpha.userId, planId: "pro", now: noonRome });
    expect(blocked).toEqual({ ok: false, reason: "user", message: quoteSendLimitReachedMessage("pro") });
  });

  it("sul piano Business gli invii dell'utente sono illimitati", async () => {
    await setOverride("business");
    for (let i = 0; i < 16; i += 1) {
      expect((await reserveQuoteSend(db, { userId: alpha.userId, planId: "business", now: noonRome })).ok).toBe(true);
    }
    const quota = await getQuoteSendQuota(db, { userId: alpha.userId, planId: "business", now: noonRome });
    expect(quota).toMatchObject({ used: 16, limit: null, reached: false, message: null });
    expect(quoteSendQuotaLabel(quota.used, quota.limit)).toBe("Illimitati");
  });

  it("a mezzanotte ora di Roma il conteggio riparte da zero", async () => {
    const beforeMidnight = new Date("2026-11-14T22:59:59Z");
    const afterMidnight = new Date("2026-11-14T23:00:00Z");
    for (let i = 0; i < 3; i += 1) {
      expect((await reserveQuoteSend(db, { userId: alpha.userId, planId: "starter", now: beforeMidnight })).ok).toBe(true);
    }
    expect((await reserveQuoteSend(db, { userId: alpha.userId, planId: "starter", now: beforeMidnight })).ok).toBe(false);
    expect((await getQuoteSendQuota(db, { userId: alpha.userId, planId: "starter", now: afterMidnight })).used).toBe(0);
    expect((await reserveQuoteSend(db, { userId: alpha.userId, planId: "starter", now: afterMidnight })).ok).toBe(true);
  });

  it("il tetto globale ferma anche il piano Business e non consuma la quota utente se rifiuta", async () => {
    const env = { QUOTE_SEND_GLOBAL_DAILY_CAP: "2" };
    const other = await joinAs(db, alpha.workspaceId, "marco@example.com", "member");
    expect((await reserveQuoteSend(db, { userId: alpha.userId, planId: "business", now: noonRome, env })).ok).toBe(true);
    expect((await reserveQuoteSend(db, { userId: other.userId, planId: "business", now: noonRome, env })).ok).toBe(true);
    const blocked = await reserveQuoteSend(db, { userId: alpha.userId, planId: "business", now: noonRome, env });
    expect(blocked).toEqual({ ok: false, reason: "global", message: QUOTE_SEND_GLOBAL_CAP_MESSAGE });
    expect((await getQuoteSendQuota(db, { userId: alpha.userId, planId: "business", now: noonRome, env })).used).toBe(1);
    expect((await getQuoteSendQuota(db, { userId: other.userId, planId: "business", now: noonRome, env })).globalBlocked).toBe(true);
  });

  it("due utenti dello stesso workspace hanno quote separate", async () => {
    const other = await joinAs(db, alpha.workspaceId, "marco@example.com", "member");
    for (let i = 0; i < 3; i += 1) {
      expect((await reserveQuoteSend(db, { userId: alpha.userId, planId: "starter", now: noonRome })).ok).toBe(true);
    }
    expect((await reserveQuoteSend(db, { userId: other.userId, planId: "starter", now: noonRome })).ok).toBe(true);
    expect((await getQuoteSendQuota(db, { userId: other.userId, planId: "starter", now: noonRome })).used).toBe(1);
  });

  it("copia e invio solo link non consumano la quota; un fallimento la rilascia", async () => {
    expect(must(await sendQuote(db, alpha, quoteId, { mode: "link", revision: (await emailInput()).revision }, noonRome)).emailQueued).toBe(false);
    expect((await getQuoteSendQuota(db, { userId: alpha.userId, planId: "starter", now: noonRome })).used).toBe(0);

    const badRevision = await sendQuote(db, alpha, quoteId, { ...(await emailInput()), revision: 999 }, noonRome);
    expect(badRevision.ok).toBe(false);
    expect((await getQuoteSendQuota(db, { userId: alpha.userId, planId: "starter", now: noonRome })).used).toBe(0);

    must(await sendQuote(db, alpha, quoteId, await emailInput(), noonRome));
    expect((await getQuoteSendQuota(db, { userId: alpha.userId, planId: "starter", now: noonRome })).used).toBe(1);

    const failing = { send: vi.fn(async () => Promise.reject(new Error("resend down"))) };
    await processDueJobs(db, quoteJobHandlers(db, { driver: failing, renderPdf: async () => ({ filename: "p.pdf", content: Buffer.from("%PDF") }) }));
    expect((await getQuoteSendQuota(db, { userId: alpha.userId, planId: "starter", now: noonRome })).used).toBe(1);
    await db.update(outboxJobs).set({ attempts: 4, nextRunAt: new Date(0) });
    await processDueJobs(db, quoteJobHandlers(db, { driver: failing, renderPdf: async () => ({ filename: "p.pdf", content: Buffer.from("%PDF") }) }));
    expect((await getQuoteSendQuota(db, { userId: alpha.userId, planId: "starter", now: noonRome })).used).toBe(0);

    const released = await reserveQuoteSend(db, { userId: alpha.userId, planId: "starter", now: noonRome });
    expect(released.ok).toBe(true);
    if (released.ok) await releaseQuoteSend(db, { userId: alpha.userId, day: released.day });
    expect((await getQuoteSendQuota(db, { userId: alpha.userId, planId: "starter", now: noonRome })).used).toBe(0);
  });

});
