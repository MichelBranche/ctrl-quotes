import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "@/db/client";
import { quotePublicLinks, quotes } from "@/db/schema";
import { createPublicLink, regeneratePublicLink, resolvePublicLink, revealPublicLinkUrl, revokePublicLink } from "@/server/public-links";
import { generateLinkToken, hashLinkToken } from "@/server/link-token";
import { createTestDb } from "./helpers/db";
import { ownerWithWorkspace } from "./helpers/actors";

describe("servizio dei link pubblici", () => {
  let db: AppDatabase;
  let workspaceId: string;
  let userId: string;
  const now = new Date("2026-11-14T10:00:00Z");

  beforeEach(async () => {
    process.env.PUBLIC_QUOTE_BASE_URL = "https://ctrl-quotes.vercel.app";
    db = await createTestDb();
    ({ workspaceId, userId } = await ownerWithWorkspace(db, "link@example.com", "Studio Link"));
    await db.insert(quotes).values({ id: "q1", workspaceId, title: "Sito", status: "pending", createdAt: now, updatedAt: now });
  });

  it("crea un link: in DB solo hash, copia cifrata e indizio", async () => {
    const link = await createPublicLink(db, { workspaceId, quoteId: "q1", createdBy: userId, expiresAt: new Date("2027-01-12T23:00:00Z"), now });
    expect(link.url).toBe(`https://ctrl-quotes.vercel.app/q/${link.token}`);
    const rows = await db.select().from(quotePublicLinks);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.tokenHash).toBe(hashLinkToken(link.token));
    expect(row.tokenHint).toBe(link.token.slice(-4));
    expect(JSON.stringify(row)).not.toContain(link.token);
    expect(await revealPublicLinkUrl(db, workspaceId, link.id)).toBe(link.url);
  });

  it("risolve un token valido e tratta allo stesso modo token sconosciuti e malformati", async () => {
    const link = await createPublicLink(db, { workspaceId, quoteId: "q1", createdBy: userId, now });
    const resolved = await resolvePublicLink(db, link.token, now);
    expect(resolved.state).toBe("active");
    if (resolved.state !== "invalid") expect(resolved.quote.id).toBe("q1");
    expect((await resolvePublicLink(db, generateLinkToken(), now)).state).toBe("invalid");
    expect((await resolvePublicLink(db, "corto", now)).state).toBe("invalid");
    expect((await resolvePublicLink(db, undefined, now)).state).toBe("invalid");
  });

  it("scade con la validità, ma un preventivo accettato resta leggibile", async () => {
    const link = await createPublicLink(db, { workspaceId, quoteId: "q1", createdBy: userId, expiresAt: new Date("2026-11-20T00:00:00Z"), now });
    expect((await resolvePublicLink(db, link.token, new Date("2026-11-19T23:59:00Z"))).state).toBe("active");
    expect((await resolvePublicLink(db, link.token, new Date("2026-11-20T00:00:00Z"))).state).toBe("expired");
    await db.update(quotes).set({ status: "accepted" }).where(eq(quotes.id, "q1"));
    expect((await resolvePublicLink(db, link.token, new Date("2026-12-01T00:00:00Z"))).state).toBe("active");
  });

  it("revoca immediata e idempotente; un preventivo eliminato rende il link non valido", async () => {
    const link = await createPublicLink(db, { workspaceId, quoteId: "q1", createdBy: userId, now });
    expect(await revokePublicLink(db, { workspaceId, linkId: link.id, revokedBy: userId, now })).toBe(true);
    expect(await revokePublicLink(db, { workspaceId, linkId: link.id, revokedBy: userId, now })).toBe(false);
    expect((await resolvePublicLink(db, link.token, now)).state).toBe("revoked");
    expect(await revealPublicLinkUrl(db, workspaceId, link.id)).toBeNull();
    const other = await createPublicLink(db, { workspaceId, quoteId: "q1", createdBy: userId, now });
    await db.update(quotes).set({ deletedAt: now }).where(eq(quotes.id, "q1"));
    expect((await resolvePublicLink(db, other.token, now)).state).toBe("invalid");
  });

  it("rigenera: il vecchio muore e punta al nuovo, scadenza conservata", async () => {
    const expiresAt = new Date("2027-01-12T23:00:00Z");
    const old = await createPublicLink(db, { workspaceId, quoteId: "q1", createdBy: userId, expiresAt, now });
    const fresh = await regeneratePublicLink(db, { workspaceId, linkId: old.id, userId, now });
    expect(fresh).not.toBeNull();
    expect(fresh!.token).not.toBe(old.token);
    expect((await resolvePublicLink(db, old.token, now)).state).toBe("revoked");
    const resolved = await resolvePublicLink(db, fresh!.token, now);
    expect(resolved.state).toBe("active");
    const oldRow = (await db.select().from(quotePublicLinks).where(eq(quotePublicLinks.id, old.id)))[0];
    expect(oldRow?.replacedByLinkId).toBe(fresh!.id);
    if (resolved.state === "active") expect(resolved.link.expiresAt?.getTime()).toBe(expiresAt.getTime());
  });

  it("un altro workspace non vede né revoca i link", async () => {
    const link = await createPublicLink(db, { workspaceId, quoteId: "q1", createdBy: userId, now });
    const other = await ownerWithWorkspace(db, "altro@example.com", "Altro Studio");
    expect(await revealPublicLinkUrl(db, other.workspaceId, link.id)).toBeNull();
    expect(await revokePublicLink(db, { workspaceId: other.workspaceId, linkId: link.id, revokedBy: other.userId })).toBe(false);
    expect(await regeneratePublicLink(db, { workspaceId: other.workspaceId, linkId: link.id, userId: other.userId })).toBeNull();
  });
});
