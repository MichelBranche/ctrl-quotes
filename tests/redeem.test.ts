import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "@/db/client";
import { auditLogs, redeemCodes, redeemCodeUses } from "@/db/schema";
import { activePlanOverride, nextOverride, normalizeRedeemCode } from "@/domain/redeem";
import { currentPlanLabel } from "@/domain/plans";
import { createRedeemCode, hashRedeemCode, redeemCode } from "@/server/redeem";
import { listWorkspaces } from "@/server/workspaces";
import { joinAs, makeUser, ownerWithWorkspace } from "./helpers/actors";
import { createTestDb } from "./helpers/db";

const DAY = 86_400_000;
const t0 = Date.UTC(2026, 10, 14, 10, 0, 0);

describe("codici di riscatto", () => {
  let db: AppDatabase;
  let owner: { userId: string; workspaceId: string };

  beforeEach(async () => {
    db = await createTestDb();
    owner = await ownerWithWorkspace(db, "giulia@example.com", "Studio Neri");
  });

  const make = (code: string, extra: Partial<Parameters<typeof createRedeemCode>[1]> = {}) =>
    createRedeemCode(db, { code, kind: "free_month", plan: "pro", days: 30, maxUses: 5, expiresAt: null, ...extra }, new Date(t0));

  it("normalizza il codice senza distinguere maiuscole e spazi", () => {
    expect(normalizeRedeemCode(" cq-ab12 -xy ")).toBe("CQ-AB12-XY");
    expect(normalizeRedeemCode("ab")).toBeNull();
    expect(normalizeRedeemCode("drop table;")).toBeNull();
    expect(normalizeRedeemCode(42)).toBeNull();
  });

  it("free_month: sblocca il piano per N giorni, case-insensitive, e il piano letto cambia", async () => {
    await make("PROVA-PRO");
    const result = await redeemCode(db, { ...owner, code: "prova-pro" }, t0);
    expect(result).toEqual({ ok: true, value: { plan: "pro", kind: "free_month", days: 30, until: t0 + 30 * DAY } });
    const [code] = await db.select().from(redeemCodes);
    expect(code?.usedCount).toBe(1);
    const [ws] = await listWorkspaces(db, owner.userId);
    expect(ws?.planOverride).toBe("pro");
    expect(currentPlanLabel(ws!.plan, ws!.planOverride)).toBe("Piano Pro");
  });

  it("lifetime: override senza scadenza", async () => {
    await make("PER-SEMPRE", { kind: "lifetime", plan: "business", days: null });
    const result = await redeemCode(db, { ...owner, code: "PER-SEMPRE" }, t0);
    expect(result).toEqual({ ok: true, value: { plan: "business", kind: "lifetime", days: null, until: null } });
    const [ws] = await listWorkspaces(db, owner.userId);
    expect(ws?.planOverride).toBe("business");
    expect(ws?.planOverrideUntil).toBeNull();
  });

  it("errori: non valido, scaduto, già usato, esaurito", async () => {
    expect(await redeemCode(db, { ...owner, code: "NON-ESISTE" }, t0)).toEqual({ ok: false, error: "invalid" });
    expect(await redeemCode(db, { ...owner, code: "" }, t0)).toEqual({ ok: false, error: "invalid" });

    await make("VECCHIO", { expiresAt: new Date(t0 - 1) });
    expect(await redeemCode(db, { ...owner, code: "VECCHIO" }, t0)).toEqual({ ok: false, error: "expired" });

    await make("UNA-VOLTA");
    expect((await redeemCode(db, { ...owner, code: "UNA-VOLTA" }, t0)).ok).toBe(true);
    expect(await redeemCode(db, { ...owner, code: "una-volta" }, t0)).toEqual({ ok: false, error: "used" });

    await make("SOLO-UNO", { maxUses: 1 });
    const other = await ownerWithWorkspace(db, "paolo@example.com", "Studio Verdi");
    expect((await redeemCode(db, { ...other, code: "SOLO-UNO" }, t0)).ok).toBe(true);
    expect(await redeemCode(db, { ...owner, code: "SOLO-UNO" }, t0)).toEqual({ ok: false, error: "exhausted" });

    const uses = await db.select().from(redeemCodeUses);
    expect(uses).toHaveLength(2);
  });

  it("un membro semplice o un estraneo non può riscattare per il workspace", async () => {
    await make("MEMBRO");
    const member = await joinAs(db, owner.workspaceId, "membro@example.com", "member");
    expect(await redeemCode(db, { ...member, code: "MEMBRO" }, t0)).toEqual({ ok: false, error: "forbidden" });
    const stranger = await makeUser(db, "x@example.com");
    expect(await redeemCode(db, { userId: stranger, workspaceId: owner.workspaceId, code: "MEMBRO" }, t0)).toEqual({ ok: false, error: "forbidden" });
    const [code] = await db.select().from(redeemCodes);
    expect(code?.usedCount).toBe(0);
  });

  it("concorrenza: 10 workspace in parallelo su un codice da 3 utilizzi → esattamente 3 riscatti", async () => {
    await make("TRE-POSTI", { maxUses: 3 });
    const owners = await Promise.all(Array.from({ length: 10 }, (_, i) => ownerWithWorkspace(db, `w${i}@example.com`, `W${i}`)));
    const results = await Promise.all(owners.map((item) => redeemCode(db, { ...item, code: "TRE-POSTI" }, t0)));
    expect(results.filter((item) => item.ok)).toHaveLength(3);
    expect(results.filter((item) => !item.ok && item.error === "exhausted")).toHaveLength(7);
    const [code] = await db.select().from(redeemCodes).where(eq(redeemCodes.code, hashRedeemCode("TRE-POSTI")));
    expect(code?.usedCount).toBe(3);
    expect(await db.select().from(redeemCodeUses)).toHaveLength(3);
  });

  it("concorrenza: lo stesso utente che invia due volte insieme riscatta una volta sola", async () => {
    await make("DOPPIO-CLIC", { maxUses: 10 });
    const results = await Promise.all([1, 2, 3].map(() => redeemCode(db, { ...owner, code: "DOPPIO-CLIC" }, t0)));
    expect(results.filter((item) => item.ok)).toHaveLength(1);
    expect(results.filter((item) => !item.ok && item.error === "used")).toHaveLength(2);
    const [code] = await db.select().from(redeemCodes);
    expect(code?.usedCount).toBe(1);
  });

  it("un periodo gratuito non accorcia un piano a vita; uno dello stesso piano si somma", async () => {
    expect(nextOverride({ plan: "pro", until: t0 + 10 * DAY }, { kind: "free_month", plan: "pro", days: 30 }, t0)).toEqual({ plan: "pro", until: t0 + 40 * DAY });
    expect(nextOverride({ plan: "starter", until: t0 + 10 * DAY }, { kind: "free_month", plan: "pro", days: 30 }, t0)).toEqual({ plan: "pro", until: t0 + 30 * DAY });
    await make("A-VITA", { kind: "lifetime", days: null });
    await make("MESE");
    expect((await redeemCode(db, { ...owner, code: "A-VITA" }, t0)).ok).toBe(true);
    expect(await redeemCode(db, { ...owner, code: "MESE" }, t0)).toEqual({ ok: false, error: "lifetime_active" });
  });

  it("salva solo l'hash del codice, mai il testo in chiaro", async () => {
    await make("SEGRETO-PRO");
    const [row] = await db.select().from(redeemCodes);
    expect(row?.code).toBe(hashRedeemCode("SEGRETO-PRO"));
    expect(row?.code).not.toBe("SEGRETO-PRO");
  });

  it("un riscatto riuscito lascia una riga di audit senza il codice in chiaro", async () => {
    await make("AUDIT-PRO");
    expect((await redeemCode(db, { ...owner, code: "AUDIT-PRO" }, t0)).ok).toBe(true);
    const [log] = await db.select().from(auditLogs);
    expect(log?.action).toBe("billing.code_redeemed");
    expect(log?.workspaceId).toBe(owner.workspaceId);
    expect(JSON.stringify(log)).not.toMatch(/AUDIT-PRO/i);
  });

  it("un override scaduto non conta più", () => {
    expect(activePlanOverride("pro", t0 - 1, t0)).toBeNull();
    expect(activePlanOverride("pro", t0 + 1, t0)).toBe("pro");
    expect(activePlanOverride("pro", null, t0)).toBe("pro");
    expect(activePlanOverride("gold", null, t0)).toBeNull();
  });
});

describe("migrazione 0005, solo aggiunte", () => {
  it("crea tabelle e aggiunge colonne nullable, senza ricostruire workspaces", async () => {
    const fs = await import("node:fs");
    const sql = fs.readFileSync("drizzle/0005_codici_riscatto.sql", "utf8");
    expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|UPDATE `|RENAME|__new_/);
    for (const line of sql.split("\n").filter((item) => item.startsWith("ALTER TABLE"))) expect(line).not.toMatch(/NOT NULL/);
  });
});
