import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "@/db/client";
import { quoteEvents, quotePublicLinks, quotes } from "@/db/schema";
import { createCatalogItem } from "@/server/catalog";
import { createClient } from "@/server/clients";
import { loadPublicQuote, openSentVersion, readSnapshotAsset, recordView } from "@/server/public-quote";
import { revokeQuoteLink, sendQuote } from "@/server/quote-send";
import { createQuote, getQuoteEditor, saveDraft } from "@/server/quotes";
import { createTestDb } from "./helpers/db";
import { ownerWithWorkspace } from "./helpers/actors";

function must<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

describe("pagina pubblica del preventivo", () => {
  let db: AppDatabase;
  let alpha: { userId: string; workspaceId: string };
  let quoteId: string;
  let clientId: string;
  let token: string;
  const ip = "203.0.113.7";

  beforeEach(async () => {
    process.env.PUBLIC_QUOTE_BASE_URL = "https://ctrl-quotes.vercel.app";
    db = await createTestDb();
    alpha = await ownerWithWorkspace(db, "giulia@example.com", "Studio Alpha");
    clientId = must(await createClient(db, alpha, { kind: "azienda", name: "Atelier Nord", email: "progetti@atelier.example" })).id;
    const itemId = must(await createCatalogItem(db, alpha, { type: "servizio", name: "Design", unitPriceCents: 120000, taxRateBp: 2200 })).id;
    quoteId = must(await createQuote(db, alpha, { clientId, title: "Nuovo sito web", catalogItemIds: [itemId] })).id;
    const editor = must(await getQuoteEditor(db, alpha, quoteId));
    const sent = must(await sendQuote(db, alpha, quoteId, { mode: "link", revision: editor.revision }));
    token = sent.link.url!.split("/q/")[1]!;
  });

  it("mostra la versione inviata, non la bozza modificata dopo", async () => {
    const editor = must(await getQuoteEditor(db, alpha, quoteId));
    must(await saveDraft(db, alpha, quoteId, { revision: editor.revision, title: "Titolo nella bozza", clientId, templateId: "tpl_bold", validUntil: editor.quote.validUntil, document: editor.document }));
    const view = await loadPublicQuote(db, token, ip);
    expect(view.kind).toBe("active");
    if (view.kind !== "active") return;
    expect(view.versionNo).toBe(1);
    expect(view.snapshot.quote.title).toBe("Nuovo sito web");
    expect(view.studioName).toBe("Studio Alpha");
  });

  it("link sbagliato, revocato e scaduto: pagine diverse, lo scaduto passa a Scaduto", async () => {
    expect((await loadPublicQuote(db, "x".repeat(43), ip)).kind).toBe("invalid");
    expect((await loadPublicQuote(db, "corto", ip)).kind).toBe("invalid");
    await db.update(quotePublicLinks).set({ expiresAt: new Date("2020-01-01T00:00:00Z") });
    expect((await loadPublicQuote(db, token, ip)).kind).toBe("expired");
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    expect(quote!.status).toBe("expired");
    expect(await openSentVersion(db, token, ip)).toBeNull();
    await db.update(quotePublicLinks).set({ expiresAt: null });
    must(await revokeQuoteLink(db, alpha, quoteId));
    expect((await loadPublicQuote(db, token, ip)).kind).toBe("revoked");
  });

  it("limita i tentativi con token sbagliati per IP", async () => {
    let last = "";
    for (let i = 0; i < 21; i += 1) last = (await loadPublicQuote(db, "y".repeat(43), "198.51.100.9")).kind;
    expect(last).toBe("limited");
    expect((await loadPublicQuote(db, token, "203.0.113.50")).kind).toBe("active");
  });

  it("registra le aperture: un solo evento alla prima, contatori sempre, lo studio non conta", async () => {
    expect(await recordView(db, token, { userAgent: "Mozilla/5.0 (iPhone)", skipWorkspaceIds: [alpha.workspaceId] })).toEqual({ recorded: false, first: false });
    expect(await recordView(db, token, { userAgent: "Mozilla/5.0 (iPhone)" })).toEqual({ recorded: true, first: true });
    expect(await recordView(db, token, { userAgent: "Mozilla/5.0" })).toEqual({ recorded: true, first: false });
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    expect(quote!.viewCount).toBe(2);
    expect(quote!.firstViewedAt).toBeInstanceOf(Date);
    const [link] = await db.select().from(quotePublicLinks);
    expect(link!.viewCount).toBe(2);
    const events = await db.select().from(quoteEvents).where(and(eq(quoteEvents.quoteId, quoteId), eq(quoteEvents.type, "viewed")));
    expect(events).toHaveLength(1);
    expect(events[0]!.actor).toBe("recipient");
    expect(JSON.parse(events[0]!.meta!)).toMatchObject({ device: "telefono" });
    expect(events[0]!.meta).not.toContain(ip);
  });

  it("serve solo le immagini della versione inviata", async () => {
    const sent = await openSentVersion(db, token, ip);
    expect(sent && !("limited" in sent)).toBe(true);
    if (!sent || "limited" in sent) return;
    expect(await readSnapshotAsset(db, sent.workspaceId, sent.snapshot, "asset-non-usato")).toBeNull();
  });
});
