import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLogs, workspaceInvitations, workspaceMemberships, workspaces } from "@/db/schema";
import { hashLinkToken } from "@/server/link-token";
import { createTestDb } from "./helpers/db";
import { joinAs, ownerWithWorkspace } from "./helpers/actors";
import {
  acceptInvite,
  createWorkspaceInvite,
  getSeatUsage,
  listPendingInvites,
  previewInvite,
  resendWorkspaceInvite,
  revokeWorkspaceInvite,
  type InviteDeps,
} from "@/server/invites";
import { removeMember } from "@/server/team";
import type { EmailMessage } from "@/server/email/types";
import type { RateLimiter, RateResult, RateRule } from "@/server/rate-limit";

const origin = "https://quotes.ctrlagency.dev";

function mailbox(): { sent: EmailMessage[]; deps: InviteDeps } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    deps: {
      origin,
      send: async (message) => {
        sent.push(message);
      },
    },
  };
}

function tokenFrom(message: EmailMessage): string {
  const match = message.text.match(/\/invite\/([A-Za-z0-9_-]{43})/);
  if (!match) throw new Error("token missing from email");
  return match[1];
}

/** The trial now has Starter limits (1 seat): invite flows run on a paid Pro workspace. */
async function proOwner(db: Awaited<ReturnType<typeof createTestDb>>, email: string, name: string) {
  const owner = await ownerWithWorkspace(db, email, name);
  await db.update(workspaces).set({ plan: "pro" }).where(eq(workspaces.id, owner.workspaceId));
  return owner;
}

describe("inviti al team", () => {
  it("durante la prova vale il limite Starter: i membri in più restano, ma non si invita nessun altro", async () => {
    const db = await createTestDb();
    const owner = await ownerWithWorkspace(db, "owner@example.com", "Studio Prova");
    await joinAs(db, owner.workspaceId, "gia-dentro@example.com", "member");
    const box = mailbox();
    const created = await createWorkspaceInvite(db, owner, { email: "nuovo@example.com", role: "member" }, box.deps);
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.message).toContain("limite di 1 posto");
    expect(box.sent).toHaveLength(0);
    const usage = await getSeatUsage(db, owner.workspaceId);
    expect(usage).toMatchObject({ members: 2, limit: 1 });
  });

  it("consente a titolare e admin di invitare un membro, con token in hash e email di sistema", async () => {
    const db = await createTestDb();
    const owner = await proOwner(db, "owner@example.com", "Studio Nord");
    const admin = await joinAs(db, owner.workspaceId, "admin@example.com", "admin");
    const box = mailbox();

    const created = await createWorkspaceInvite(db, owner, { email: "nuovo@example.com", role: "member" }, box.deps);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(box.sent).toHaveLength(1);
    expect(box.sent[0].to).toBe("nuovo@example.com");
    expect(box.sent[0].subject).toContain("Studio Nord");
    expect(box.sent[0].html).toContain("Accetta l'invito");
    const token = tokenFrom(box.sent[0]);
    const [row] = await db.select().from(workspaceInvitations);
    expect(row.tokenHash).toBe(hashLinkToken(token));
    expect(row.tokenHash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.email).toBe("nuovo@example.com");
    expect(row.role).toBe("member");

    const listed = await listPendingInvites(db, admin);
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value.map((item) => item.email)).toEqual(["nuovo@example.com"]);

    const logs = await db.select().from(auditLogs);
    expect(logs.some((item) => item.action === "invite.created")).toBe(true);
  });

  it("impedisce a un membro di invitare e a un admin di invitare un altro admin", async () => {
    const db = await createTestDb();
    const owner = await proOwner(db, "owner@example.com", "Studio");
    const admin = await joinAs(db, owner.workspaceId, "admin@example.com", "admin");
    const member = await joinAs(db, owner.workspaceId, "member@example.com", "member");
    const box = mailbox();

    const asMember = await createWorkspaceInvite(db, member, { email: "a@example.com", role: "member" }, box.deps);
    expect(asMember.ok).toBe(false);
    if (!asMember.ok) expect(asMember.error).toBe("forbidden");

    const adminInvitesAdmin = await createWorkspaceInvite(db, admin, { email: "b@example.com", role: "admin" }, box.deps);
    expect(adminInvitesAdmin.ok).toBe(false);
    if (!adminInvitesAdmin.ok) expect(adminInvitesAdmin.message).toContain("titolare");

    const ownerInvitesAdmin = await createWorkspaceInvite(db, owner, { email: "c@example.com", role: "admin" }, box.deps);
    expect(ownerInvitesAdmin.ok).toBe(true);
    expect(box.sent).toHaveLength(1);
  });

  it("rifiuta un invito a un membro già presente o a un invito già in attesa", async () => {
    const db = await createTestDb();
    const owner = await proOwner(db, "owner@example.com", "Studio");
    await joinAs(db, owner.workspaceId, "gia@example.com", "member");
    const box = mailbox();
    const existing = await createWorkspaceInvite(db, owner, { email: "GIA@example.com", role: "member" }, box.deps);
    expect(existing.ok).toBe(false);
    if (!existing.ok) expect(existing.error).toBe("conflict");

    const first = await createWorkspaceInvite(db, owner, { email: "nuovo@example.com", role: "member" }, box.deps);
    expect(first.ok).toBe(true);
    const second = await createWorkspaceInvite(db, owner, { email: "nuovo@example.com", role: "member" }, box.deps);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.message).toContain("già un invito");
  });

  it("rispetta il limite posti: con override Starter (1 posto) un secondo invito non parte", async () => {
    const db = await createTestDb();
    const owner = await proOwner(db, "owner@example.com", "Studio");
    await db.update(workspaces).set({ planOverride: "starter" }).where(eq(workspaces.id, owner.workspaceId));
    const box = mailbox();
    const created = await createWorkspaceInvite(db, owner, { email: "extra@example.com", role: "member" }, box.deps);
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.message).toContain("limite di 1 posto");
    expect(box.sent).toHaveLength(0);
  });

  it("accetta l'invito con l'email giusta, una sola volta, e rifiuta email diversa o token scaduto", async () => {
    const db = await createTestDb();
    const owner = await proOwner(db, "owner@example.com", "Studio");
    const box = mailbox();
    const created = await createWorkspaceInvite(db, owner, { email: "ospite@example.com", role: "member" }, box.deps);
    expect(created.ok).toBe(true);
    const token = tokenFrom(box.sent[0]);
    const preview = await previewInvite(db, token);
    expect(preview?.workspaceName).toBe("Studio");
    expect(preview?.email).toBe("ospite@example.com");
    expect(preview?.status).toBe("pending");

    const stranger = await joinAs(db, owner.workspaceId, "altro@example.com", "member");
    const wrong = await acceptInvite(db, { userId: stranger.userId, token });
    expect(wrong.ok).toBe(false);

    const guestId = (await joinAs(db, (await proOwner(db, "tmp@example.com", "Altro")).workspaceId, "ospite@example.com", "member")).userId;
    // joinAs creates the user; remove them from the other workspace is unnecessary for accept
    const accepted = await acceptInvite(db, { userId: guestId, token });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.value.workspaceId).toBe(owner.workspaceId);
      expect(accepted.value.alreadyMember).toBe(false);
    }
    const memberships = await db
      .select()
      .from(workspaceMemberships)
      .where(eq(workspaceMemberships.workspaceId, owner.workspaceId));
    expect(memberships.some((row) => row.userId === guestId && row.role === "member")).toBe(true);

    const reuse = await acceptInvite(db, { userId: guestId, token });
    expect(reuse.ok).toBe(true);
    if (reuse.ok) expect(reuse.value.alreadyMember).toBe(true);

    const expiredBox = mailbox();
    const second = await createWorkspaceInvite(db, owner, { email: "late@example.com", role: "member" }, expiredBox.deps);
    expect(second.ok).toBe(true);
    const lateToken = tokenFrom(expiredBox.sent[0]);
    const lateUser = (await joinAs(db, (await proOwner(db, "x2@example.com", "X2")).workspaceId, "late@example.com", "member")).userId;
    const expired = await acceptInvite(db, { userId: lateUser, token: lateToken }, new Date(Date.now() + 8 * 24 * 60 * 60 * 1000));
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.message).toContain("scaduto");
  });

  it("il reinvio invalida il token precedente; la revoca impedisce l'accettazione", async () => {
    const db = await createTestDb();
    const owner = await proOwner(db, "owner@example.com", "Studio");
    const box = mailbox();
    const created = await createWorkspaceInvite(db, owner, { email: "re@example.com", role: "member" }, box.deps);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const oldToken = tokenFrom(box.sent[0]);
    const resent = await resendWorkspaceInvite(db, owner, created.value.id, box.deps);
    expect(resent.ok).toBe(true);
    const newToken = tokenFrom(box.sent[1]);
    expect(newToken).not.toBe(oldToken);

    const guestId = (await joinAs(db, (await proOwner(db, "y@example.com", "Studio Y")).workspaceId, "re@example.com", "member")).userId;
    const oldAccept = await acceptInvite(db, { userId: guestId, token: oldToken });
    expect(oldAccept.ok).toBe(false);

    const other = await createWorkspaceInvite(db, owner, { email: "revoca@example.com", role: "member" }, box.deps);
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    const revokedToken = tokenFrom(box.sent[2]);
    const revoked = await revokeWorkspaceInvite(db, owner, other.value.id);
    expect(revoked.ok).toBe(true);
    const revokee = (await joinAs(db, (await proOwner(db, "z@example.com", "Studio Z")).workspaceId, "revoca@example.com", "member")).userId;
    const afterRevoke = await acceptInvite(db, { userId: revokee, token: revokedToken });
    expect(afterRevoke.ok).toBe(false);
    const logs = await db.select().from(auditLogs);
    expect(logs.some((item) => item.action === "invite.resent")).toBe(true);
    expect(logs.some((item) => item.action === "invite.revoked")).toBe(true);
  });

  it("applica il rate limit sugli invii", async () => {
    const db = await createTestDb();
    const owner = await proOwner(db, "owner@example.com", "Studio");
    const limiter: RateLimiter = {
      async hit(_rule: RateRule, subject: string): Promise<RateResult> {
        if (subject === owner.workspaceId) return { ok: false, remaining: 0, resetAt: Date.now() + 1000 };
        return { ok: true, remaining: 1, resetAt: Date.now() + 1000 };
      },
    };
    const box = mailbox();
    const result = await createWorkspaceInvite(db, owner, { email: "rate@example.com", role: "member" }, { ...box.deps, limiter });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("troppi inviti");
    expect(box.sent).toHaveLength(0);
  });

  it("protegge l'unico titolare dalla rimozione", async () => {
    const db = await createTestDb();
    const owner = await proOwner(db, "owner@example.com", "Studio");
    const admin = await joinAs(db, owner.workspaceId, "admin@example.com", "admin");
    const removed = await removeMember(db, admin, owner.userId);
    expect(removed.ok).toBe(false);
    if (!removed.ok) expect(removed.message).toContain("titolare");
  });
});
