import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "@/db/client";
import {
  auditLogs,
  brandKits,
  catalogCategories,
  catalogItems,
  clients,
  quotePublicLinks,
  quoteVersions,
  quotes,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import { createId } from "@/domain/ids";
import { writeAuditLog } from "@/server/audit";
import { createPublicLink, resolvePublicLink } from "@/server/public-links";
import { createWorkspace, deleteWorkspace, listWorkspaces, updateWorkspace } from "@/server/workspaces";
import { createTestDb } from "./helpers/db";
import { joinAs, makeUser, ownerWithWorkspace } from "./helpers/actors";

const now = new Date("2026-11-14T10:00:00Z");

describe("eliminazione workspace", () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("rifiuta chi non è proprietario e non svela un workspace altrui", async () => {
    const owner = await ownerWithWorkspace(db, "owner@example.com", "Studio Nord");
    const other = await ownerWithWorkspace(db, "altro@example.com", "Studio Sud");
    await createWorkspace(db, { userId: owner.userId, name: "Secondo Nord", taxProfile: "ordinario" });
    const admin = await joinAs(db, owner.workspaceId, "admin@example.com", "admin");
    const member = await joinAs(db, owner.workspaceId, "member@example.com", "member");

    const asAdmin = await deleteWorkspace(db, { userId: admin.userId, workspaceId: owner.workspaceId, confirmName: "Studio Nord" });
    expect(asAdmin).toEqual({ ok: false, error: "forbidden" });

    const asMember = await deleteWorkspace(db, { userId: member.userId, workspaceId: owner.workspaceId, confirmName: "Studio Nord" });
    expect(asMember).toEqual({ ok: false, error: "forbidden" });

    const stranger = await deleteWorkspace(db, { userId: other.userId, workspaceId: owner.workspaceId, confirmName: "Studio Nord" });
    expect(stranger).toEqual({ ok: false, error: "not_found" });

    const stillThere = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, owner.workspaceId));
    expect(stillThere).toHaveLength(1);
  });

  it("impedisce di eliminare l'ultimo workspace dell'account", async () => {
    const owner = await ownerWithWorkspace(db, "solo@example.com", "Unico");
    const result = await deleteWorkspace(db, { userId: owner.userId, workspaceId: owner.workspaceId, confirmName: "Unico" });
    expect(result).toEqual({ ok: false, error: "last_workspace" });
    const rows = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, owner.workspaceId));
    expect(rows).toHaveLength(1);
  });

  it("chiede il nome esatto prima di eliminare", async () => {
    const owner = await ownerWithWorkspace(db, "nome@example.com", "Studio Exact");
    await createWorkspace(db, { userId: owner.userId, name: "Altro", taxProfile: "ordinario" });
    const mismatch = await deleteWorkspace(db, { userId: owner.userId, workspaceId: owner.workspaceId, confirmName: "studio exact" });
    expect(mismatch).toEqual({ ok: false, error: "name_mismatch" });
  });

  it("elimina in transazione preventivi, versioni immutabili e catalogo, lascia gli audit e invalida il link pubblico", async () => {
    process.env.PUBLIC_QUOTE_BASE_URL = "https://quotes.ctrlagency.dev";
    const ownerId = await makeUser(db, "cascade@example.com", "Titolare");
    const doomed = await createWorkspace(db, { userId: ownerId, name: "Da eliminare", taxProfile: "ordinario" });
    const kept = await createWorkspace(db, { userId: ownerId, name: "Da tenere", taxProfile: "ordinario" });

    const clientId = createId();
    await db.insert(clients).values({
      id: clientId,
      workspaceId: doomed.id,
      kind: "azienda",
      name: "Cliente Destino",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const quoteId = createId();
    await db.insert(quotes).values({
      id: quoteId,
      workspaceId: doomed.id,
      clientId,
      title: "Preventivo da cancellare",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    const link = await createPublicLink(db, { workspaceId: doomed.id, quoteId, createdBy: ownerId, now });
    const before = await resolvePublicLink(db, link.token, now);
    expect(before.state).toBe("active");

    await db.insert(quoteVersions).values({
      id: createId(),
      workspaceId: doomed.id,
      quoteId,
      versionNo: 1,
      snapshotJson: "{}",
      snapshotSha256: "abc",
      rendererVersion: "1",
      totalsJson: "{}",
      createdAt: now,
    });
    await expect(db.delete(quoteVersions).where(eq(quoteVersions.workspaceId, doomed.id))).rejects.toThrow(/immutabile|Failed query/);
    await writeAuditLog(db, {
      workspaceId: doomed.id,
      actorUserId: ownerId,
      action: "workspace.created",
      entityType: "workspace",
      entityId: doomed.id,
    });
    await expect(db.delete(auditLogs).where(eq(auditLogs.workspaceId, doomed.id))).rejects.toThrow(/append-only|Failed query/);

    const categoryId = createId();
    await db.insert(catalogCategories).values({ id: categoryId, workspaceId: doomed.id, name: "Servizi", createdAt: now });
    await db.insert(catalogItems).values({
      id: createId(),
      workspaceId: doomed.id,
      type: "servizio",
      name: "Consulenza",
      unitPriceCents: 10000,
      createdAt: now,
      updatedAt: now,
    });

    const keptClientId = createId();
    await db.insert(clients).values({
      id: keptClientId,
      workspaceId: kept.id,
      kind: "privato",
      name: "Cliente Salvato",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const result = await deleteWorkspace(db, { userId: ownerId, workspaceId: doomed.id, confirmName: "Da eliminare" });
    expect(result).toEqual({ ok: true, nextWorkspaceId: kept.id });

    expect(await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, doomed.id))).toHaveLength(0);
    expect(await db.select({ id: clients.id }).from(clients).where(eq(clients.workspaceId, doomed.id))).toHaveLength(0);
    expect(await db.select({ id: quotes.id }).from(quotes).where(eq(quotes.workspaceId, doomed.id))).toHaveLength(0);
    expect(await db.select({ id: quoteVersions.id }).from(quoteVersions).where(eq(quoteVersions.workspaceId, doomed.id))).toHaveLength(0);
    const leftoverLogs = await db.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.workspaceId, doomed.id));
    expect(leftoverLogs).toEqual([{ action: "workspace.created" }]);
    const triggers = await db.all<{ name: string }>(sql`select name from sqlite_master where type = 'trigger' and name in ('audit_logs_no_delete', 'quote_versions_no_delete') order by name`);
    expect(triggers.map((row) => row.name)).toEqual(["audit_logs_no_delete", "quote_versions_no_delete"]);
    expect(await db.select({ id: quotePublicLinks.id }).from(quotePublicLinks).where(eq(quotePublicLinks.workspaceId, doomed.id))).toHaveLength(0);
    expect(await db.select({ id: catalogItems.id }).from(catalogItems).where(eq(catalogItems.workspaceId, doomed.id))).toHaveLength(0);
    expect(await db.select({ id: catalogCategories.id }).from(catalogCategories).where(eq(catalogCategories.workspaceId, doomed.id))).toHaveLength(0);
    expect(await db.select().from(workspaceMemberships).where(eq(workspaceMemberships.workspaceId, doomed.id))).toHaveLength(0);
    expect(await db.select().from(brandKits).where(eq(brandKits.workspaceId, doomed.id))).toHaveLength(0);

    const after = await resolvePublicLink(db, link.token, now);
    expect(after.state).toBe("invalid");

    const remaining = await listWorkspaces(db, ownerId);
    expect(remaining.map((row) => row.id)).toEqual([kept.id]);
    const keptClients = await db.select({ name: clients.name }).from(clients).where(eq(clients.workspaceId, kept.id));
    expect(keptClients).toEqual([{ name: "Cliente Salvato" }]);
  });

  it("aggiorna lo slug senza toccare quello di un altro workspace", async () => {
    const owner = await ownerWithWorkspace(db, "slug@example.com", "Studio Slug");
    const updated = await updateWorkspace(db, {
      userId: owner.userId,
      workspaceId: owner.workspaceId,
      name: "Studio Slug",
      slug: "nuovo-slug",
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.workspace.slug).toBe("nuovo-slug");
  });
});
