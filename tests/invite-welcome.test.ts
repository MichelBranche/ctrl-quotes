import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { user, workspaceInvitations, workspaces } from "@/db/schema";
import { createTestDb } from "./helpers/db";
import { makeUser, ownerWithWorkspace } from "./helpers/actors";
import { acceptInvite, acceptPendingInvitesForUser, createWorkspaceInvite, getInviteWelcome, markWelcomed } from "@/server/invites";
import { listWorkspaces } from "@/server/workspaces";
import type { EmailMessage } from "@/server/email/types";

function box() {
  const sent: EmailMessage[] = [];
  return { sent, deps: { origin: "https://quotes.example.test", send: async (m: EmailMessage) => void sent.push(m) } };
}

async function proOwner(db: Awaited<ReturnType<typeof createTestDb>>, email: string, name: string) {
  const owner = await ownerWithWorkspace(db, email, name);
  await db.update(workspaces).set({ plan: "pro" }).where(eq(workspaces.id, owner.workspaceId));
  return owner;
}

describe("invitati: niente onboarding brand, benvenuto dedicato", () => {
  it("il titolare non vede il benvenuto; l'invitato sì, una sola volta, con chi l'ha invitato e il ruolo", async () => {
    const db = await createTestDb();
    const owner = await proOwner(db, "titolare@example.com", "Studio Test");
    const [own] = await listWorkspaces(db, owner.userId);
    expect(own.welcomedAt).not.toBeNull();

    const mail = box();
    const created = await createWorkspaceInvite(db, owner, { email: "invitato@example.com", role: "member" }, mail.deps);
    expect(created.ok).toBe(true);
    const token = mail.sent[0]!.text.match(/\/invite\/([A-Za-z0-9_-]{43})/)![1];
    const invitedId = await makeUser(db, "Invitato@Example.com", "Luca Invitato");
    const accepted = await acceptInvite(db, { userId: invitedId, token });
    expect(accepted.ok).toBe(true);

    const [joined] = await listWorkspaces(db, invitedId);
    expect(joined).toMatchObject({ id: owner.workspaceId, role: "member", welcomedAt: null });
    const welcome = await getInviteWelcome(db, invitedId, owner.workspaceId);
    expect(welcome).toMatchObject({ workspaceName: "Studio Test", role: "member", inviterName: "Studio Test", welcomed: false });

    expect(await markWelcomed(db, invitedId, owner.workspaceId)).toBe(true);
    expect((await getInviteWelcome(db, invitedId, owner.workspaceId))?.welcomed).toBe(true);
    expect(await getInviteWelcome(db, owner.userId, owner.workspaceId)).toBeNull();
  });

  it("accetta da solo l'invito pendente per l'email verificata, senza perdere gli altri workspace", async () => {
    const db = await createTestDb();
    const owner = await proOwner(db, "titolare@example.com", "Studio Test");
    await createWorkspaceInvite(db, owner, { email: "socio@example.com", role: "admin" }, box().deps);
    const socio = await ownerWithWorkspace(db, "socio@example.com", "Il mio studio");

    const joined = await acceptPendingInvitesForUser(db, socio.userId);
    expect(joined).toEqual([owner.workspaceId]);
    const mine = await listWorkspaces(db, socio.userId);
    expect(mine.map((w) => w.id).sort()).toEqual([owner.workspaceId, socio.workspaceId].sort());
    const [invite] = await db.select().from(workspaceInvitations);
    expect(invite).toMatchObject({ status: "accepted", acceptedByUserId: socio.userId });
    expect(await acceptPendingInvitesForUser(db, socio.userId)).toEqual([]);
  });

  it("non accetta inviti con email non verificata, scaduti o revocati", async () => {
    const db = await createTestDb();
    const owner = await proOwner(db, "titolare@example.com", "Studio Test");
    await createWorkspaceInvite(db, owner, { email: "nuovo@example.com", role: "member" }, box().deps);
    const userId = await makeUser(db, "nuovo@example.com", "Nuovo");
    await db.update(user).set({ emailVerified: false }).where(eq(user.id, userId));
    expect(await acceptPendingInvitesForUser(db, userId)).toEqual([]);

    await db.update(user).set({ emailVerified: true }).where(eq(user.id, userId));
    await db.update(workspaceInvitations).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await acceptPendingInvitesForUser(db, userId)).toEqual([]);

    await db.update(workspaceInvitations).set({ expiresAt: new Date(Date.now() + 86_400_000), status: "revoked" });
    expect(await acceptPendingInvitesForUser(db, userId)).toEqual([]);
    expect(await listWorkspaces(db, userId)).toHaveLength(0);
  });
});
