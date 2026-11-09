import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "@/db/client";
import { auditLogs, outboxJobs, quoteVersions, quotes, user } from "@/db/schema";
import { createId } from "@/domain/ids";
import { writeAuditLog } from "@/server/audit";
import { enqueueJob, processDueJobs } from "@/server/outbox";
import { addMember, createWorkspace, getClientForMember, insertClient, updateWorkspace } from "@/server/workspaces";
import { createTestDb } from "./helpers/db";

async function userWithWorkspace(db: AppDatabase, email: string, name: string) {
  const id = createId();
  const now = new Date();
  await db.insert(user).values({
    id,
    name,
    email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  const workspace = await createWorkspace(db, {
    userId: id,
    name,
    taxProfile: "ordinario",
  });
  return { id, workspace };
}

describe("isolamento workspace", () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("impedisce all'utente A di leggere un cliente del workspace B", async () => {
    const alpha = await userWithWorkspace(db, "alpha@example.com", "Studio Alfa");
    const beta = await userWithWorkspace(db, "beta@example.com", "Studio Beta");
    const created = await insertClient(db, {
      userId: beta.id,
      workspaceId: beta.workspace.id,
      name: "Cliente Beta",
      kind: "azienda",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const crossWorkspace = await getClientForMember(db, {
      userId: alpha.id,
      workspaceId: beta.workspace.id,
      clientId: created.id,
    });
    const wrongIdInOwnWorkspace = await getClientForMember(db, {
      userId: alpha.id,
      workspaceId: alpha.workspace.id,
      clientId: created.id,
    });

    expect(crossWorkspace).toBeNull();
    expect(wrongIdInOwnWorkspace).toBeNull();
  });

  it("nega la modifica del workspace a un member e risponde not_found a un estraneo", async () => {
    const owner = await userWithWorkspace(db, "owner@example.com", "Studio Nord");
    const memberId = createId();
    const now = new Date();
    await db.insert(user).values({
      id: memberId,
      name: "Membro",
      email: "membro@example.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    const added = await addMember(db, {
      actorUserId: owner.id,
      workspaceId: owner.workspace.id,
      userId: memberId,
      role: "member",
    });
    expect(added.ok).toBe(true);

    const forbidden = await updateWorkspace(db, {
      userId: memberId,
      workspaceId: owner.workspace.id,
      name: "Nome nuovo",
    });
    const missing = await updateWorkspace(db, {
      userId: createId(),
      workspaceId: owner.workspace.id,
      name: "Nome nuovo",
    });
    expect(forbidden).toEqual({ ok: false, error: "forbidden" });
    expect(missing).toEqual({ ok: false, error: "not_found" });
  });

  it("rifiuta una query senza workspaceId", async () => {
    const alpha = await userWithWorkspace(db, "scope@example.com", "Studio Scope");
    await expect(
      getClientForMember(db, {
        userId: alpha.id,
        workspaceId: "  ",
        clientId: "x",
      }),
    ).rejects.toThrow(/workspaceId/);
  });
});

describe("audit e outbox", () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("blocca update e delete sugli audit log", async () => {
    await writeAuditLog(db, {
      action: "workspace.created",
      entityType: "workspace",
      entityId: "ws",
    });
    const row = await db.select().from(auditLogs);
    try {
      await db.delete(auditLogs).where(eq(auditLogs.id, row[0]!.id));
      throw new Error("delete succeeded");
    } catch (error) {
      const cause = error instanceof Error ? error.cause : undefined;
      const text = `${error instanceof Error ? error.message : ""} ${cause instanceof Error ? cause.message : JSON.stringify(cause)}`;
      expect(text).toMatch(/append-only/);
    }
  });

  it("esegue un job, lo ritenta e lo marca fallito al quinto tentativo", async () => {
    const id = await enqueueJob(db, { type: "demo.fail", payload: { n: 1 } });
    const handler = async () => {
      throw new Error("boom");
    };
    let clock = new Date();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const result = await processDueJobs(db, { "demo.fail": handler }, clock);
      expect(result.retried).toBe(1);
      clock = new Date(clock.getTime() + 4 * 60 * 60 * 1000);
    }
    const last = await processDueJobs(db, { "demo.fail": handler }, clock);
    expect(last.failed).toBe(1);
    const stored = await db.select().from(outboxJobs).where(eq(outboxJobs.id, id));
    expect(stored[0]?.status).toBe("failed");
    expect(stored[0]?.attempts).toBe(5);
  });

  it("blocca la modifica di una versione pubblicata", async () => {
    const owner = await userWithWorkspace(db, "version@example.com", "Studio Versioni");
    const now = new Date();
    await db.insert(quotes).values({
      id: "q1",
      workspaceId: owner.workspace.id,
      title: "Preventivo",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(quoteVersions).values({
      id: "v1",
      workspaceId: owner.workspace.id,
      quoteId: "q1",
      versionNo: 1,
      snapshotJson: "{}",
      snapshotSha256: "abc",
      rendererVersion: "1",
      totalsJson: "{}",
      createdAt: now,
    });
    await expect(
      db.update(quoteVersions).set({ snapshotJson: "cambiato" }).where(eq(quoteVersions.id, "v1")),
    ).rejects.toThrow(/immutabile|Failed query/);
  });
});
