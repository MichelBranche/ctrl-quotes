import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { quotes, session, subscriptions, workspaces } from "@/db/schema";
import { classifyWorkspaceAccess, primaryAccessStatus } from "@/domain/ecosystem-access";
import { createId } from "@/domain/ids";
import { collectEcosystemMetrics, fillSignupMonths, lastTwelveMonths } from "@/server/ecosystem-metrics";
import { bearerAuth, safeEqual } from "@/server/internal-auth";
import { joinAs, makeUser, ownerWithWorkspace } from "./helpers/actors";
import { createTestDb } from "./helpers/db";

describe("bearerAuth", () => {
  it("is unconfigured when the secret is missing or too short", () => {
    expect(bearerAuth("Bearer abcdefghijklmnop", undefined)).toBe("unconfigured");
    expect(bearerAuth("Bearer abcdefghijklmnop", "")).toBe("unconfigured");
    expect(bearerAuth("Bearer abcdefghijklmnop", "short")).toBe("unconfigured");
  });

  it("rejects a missing or wrong token", () => {
    const secret = "a-dedicated-secret-16";
    expect(bearerAuth(null, secret)).toBe("unauthorized");
    expect(bearerAuth("Bearer wrong-token-value", secret)).toBe("unauthorized");
    expect(bearerAuth("Token " + secret, secret)).toBe("unauthorized");
  });

  it("accepts a matching Bearer token", () => {
    const secret = "a-dedicated-secret-16";
    expect(bearerAuth(`Bearer ${secret}`, secret)).toBe("ok");
    expect(bearerAuth(`bearer ${secret}`, secret)).toBe("ok");
  });

  it("compares equal strings in constant time", () => {
    expect(safeEqual("same-value", "same-value")).toBe(true);
    expect(safeEqual("same-value", "other-value")).toBe(false);
  });
});

describe("andamento iscrizioni", () => {
  it("riempie i dodici mesi e tiene i conteggi noti", () => {
    const now = new Date("2026-11-22T12:00:00.000Z");
    const months = lastTwelveMonths(now);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-12");
    expect(months[11]).toBe("2026-11");
    const filled = fillSignupMonths([{ month: "2026-11", workspaces: 2 }, { month: "2026-01", workspaces: 1 }], now);
    expect(filled).toHaveLength(12);
    expect(filled.find((row) => row.month === "2026-11")?.workspaces).toBe(2);
    expect(filled.find((row) => row.month === "2026-01")?.workspaces).toBe(1);
    expect(filled.find((row) => row.month === "2026-06")?.workspaces).toBe(0);
  });
});

describe("classificazione accesso workspace", () => {
  const now = new Date("2026-11-27T12:00:00.000Z");

  it("riconosce prova attiva, prova scaduta, accesso a vita, piano a pagamento e codice temporaneo", () => {
    expect(
      classifyWorkspaceAccess(
        {
          plan: "free",
          planOverride: null,
          planOverrideUntil: null,
          trialEndsAt: new Date("2026-12-01T12:00:00.000Z"),
          subscriptionStatus: null,
        },
        now,
      ).status,
    ).toBe("trial_active");
    expect(
      classifyWorkspaceAccess(
        {
          plan: "free",
          planOverride: null,
          planOverrideUntil: null,
          trialEndsAt: new Date("2026-11-20T12:00:00.000Z"),
          subscriptionStatus: null,
        },
        now,
      ).status,
    ).toBe("trial_expired");
    expect(
      classifyWorkspaceAccess(
        {
          plan: "free",
          planOverride: "pro",
          planOverrideUntil: null,
          trialEndsAt: new Date("2026-11-20T12:00:00.000Z"),
          subscriptionStatus: null,
        },
        now,
      ).status,
    ).toBe("lifetime");
    expect(
      classifyWorkspaceAccess(
        {
          plan: "free",
          planOverride: null,
          planOverrideUntil: null,
          trialEndsAt: new Date("2026-12-01T12:00:00.000Z"),
          subscriptionStatus: "active",
        },
        now,
      ).status,
    ).toBe("paid");
    expect(
      classifyWorkspaceAccess(
        {
          plan: "free",
          planOverride: "starter",
          planOverrideUntil: new Date("2027-01-01T00:00:00.000Z"),
          trialEndsAt: null,
          subscriptionStatus: null,
        },
        now,
      ).status,
    ).toBe("redeem");
    expect(
      classifyWorkspaceAccess(
        {
          plan: "free",
          planOverride: null,
          planOverrideUntil: null,
          trialEndsAt: null,
          subscriptionStatus: null,
        },
        now,
      ).status,
    ).toBe("none");
  });

  it("preferisce il piano a pagamento come stato principale di una persona", () => {
    expect(primaryAccessStatus(["trial_expired", "lifetime", "paid"])).toBe("paid");
    expect(primaryAccessStatus(["trial_active", "none"])).toBe("trial_active");
    expect(primaryAccessStatus([])).toBe("none");
  });
});

describe("elenchi reali ecosistema", () => {
  it("aggiunge utenti e workspace senza cambiare gli aggregati né esporre segreti", async () => {
    const db = await createTestDb();
    const now = new Date("2026-11-27T12:00:00.000Z");

    const trial = await ownerWithWorkspace(db, "prova-attiva@example.com", "Studio Aurora");
    const expired = await ownerWithWorkspace(db, "prova-scaduta@example.com", "Studio Brera");
    await db
      .update(workspaces)
      .set({ trialEndsAt: new Date("2026-11-01T12:00:00.000Z") })
      .where(eq(workspaces.id, expired.workspaceId));

    const lifetime = await ownerWithWorkspace(db, "vita@example.com", "Studio Vita");
    await db
      .update(workspaces)
      .set({ planOverride: "business", planOverrideUntil: null })
      .where(eq(workspaces.id, lifetime.workspaceId));

    const paid = await ownerWithWorkspace(db, "pagante@example.com", "Studio Pagato");
    await db
      .update(workspaces)
      .set({ plan: "pro", trialEndsAt: new Date("2026-11-01T12:00:00.000Z") })
      .where(eq(workspaces.id, paid.workspaceId));
    await db.insert(subscriptions).values({
      id: createId(),
      workspaceId: paid.workspaceId,
      stripeCustomerId: "cus_secret_should_not_leak",
      stripeSubscriptionId: "sub_secret_should_not_leak",
      status: "active",
      plan: "pro",
      periodEnd: new Date("2026-12-27T12:00:00.000Z"),
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    });
    const teammate = await joinAs(db, paid.workspaceId, "collega@example.com", "member");

    const lonely = await makeUser(db, "senza-studio@example.com", "Persona Sola");
    const sessionToken = "session-token-must-stay-hidden";
    await db.insert(session).values({
      id: createId(),
      token: sessionToken,
      expiresAt: new Date("2026-12-27T12:00:00.000Z"),
      createdAt: new Date("2026-11-26T09:00:00.000Z"),
      updatedAt: new Date("2026-11-26T18:30:00.000Z"),
      userId: trial.userId,
    });

    const removed = await ownerWithWorkspace(db, "archiviato@example.com", "Studio Archiviato");
    await db
      .update(workspaces)
      .set({ deletedAt: now })
      .where(eq(workspaces.id, removed.workspaceId));

    await db.insert(quotes).values([
      { id: "q-live", workspaceId: paid.workspaceId, title: "Sito vetrina", status: "draft", createdAt: now, updatedAt: now },
      { id: "q-live-2", workspaceId: paid.workspaceId, title: "Catalogo", status: "pending", createdAt: now, updatedAt: now },
      {
        id: "q-gone",
        workspaceId: paid.workspaceId,
        title: "Cestinato",
        status: "draft",
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
      },
    ]);

    const data = await collectEcosystemMetrics(now, db);

    expect(data.app).toBe("quotes");
    expect(data.users).toBe(7);
    expect(data.workspacesAlive).toBe(4);
    expect(data.quotes).toBe(2);
    expect(data.trialsActive).toBe(1);
    expect(data.trialsExpired).toBe(1);
    expect(data.lifetimeOverrides).toBe(1);
    expect(data.stripeSubscriptionsActive).toBe(1);
    expect(data.stripeByPlan).toEqual({ starter: 0, pro: 1, business: 0 });

    expect(data.userList).toHaveLength(7);
    expect(data.workspaceList).toHaveLength(4);
    expect(data.workspaceList.map((row) => row.name)).not.toContain("Studio Archiviato");

    const trialUser = data.userList.find((row) => row.email === "prova-attiva@example.com");
    expect(trialUser).toMatchObject({
      name: "Studio Aurora",
      status: "trial_active",
      lastSeenAt: "2026-11-26T18:30:00.000Z",
    });
    expect(trialUser?.trialEndsAt).toBeTruthy();

    const expiredUser = data.userList.find((row) => row.email === "prova-scaduta@example.com");
    expect(expiredUser?.status).toBe("trial_expired");
    expect(expiredUser?.lastSeenAt).toBeNull();

    const lifetimeUser = data.userList.find((row) => row.email === "vita@example.com");
    expect(lifetimeUser?.status).toBe("lifetime");

    const paidUser = data.userList.find((row) => row.email === "pagante@example.com");
    expect(paidUser?.status).toBe("paid");
    expect(paidUser?.workspaces).toEqual([
      expect.objectContaining({ name: "Studio Pagato", role: "owner", status: "paid", planId: "pro" }),
    ]);

    const colleague = data.userList.find((row) => row.email === "collega@example.com");
    expect(colleague?.status).toBe("paid");
    expect(colleague?.workspaces[0]?.role).toBe("member");

    const solo = data.userList.find((row) => row.email === "senza-studio@example.com");
    expect(solo).toMatchObject({ name: "Persona Sola", status: "none", workspaces: [] });
    expect(solo?.id).toBe(lonely);

    const archivedUser = data.userList.find((row) => row.email === "archiviato@example.com");
    expect(archivedUser).toMatchObject({ status: "none", workspaces: [] });

    const paidWorkspace = data.workspaceList.find((row) => row.name === "Studio Pagato");
    expect(paidWorkspace).toMatchObject({
      status: "paid",
      planId: "pro",
      quoteCount: 2,
      subscriptionStatus: "active",
      subscriptionPlan: "pro",
      periodEnd: "2026-12-27T12:00:00.000Z",
      cancelAtPeriodEnd: false,
    });
    expect(paidWorkspace?.slug).toBeTruthy();
    expect(paidWorkspace?.members.map((member) => member.email)).toEqual([
      "pagante@example.com",
      "collega@example.com",
    ]);
    expect(paidWorkspace?.members[0]?.role).toBe("owner");
    expect(teammate.userId).toBe(colleague?.id);

    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain(sessionToken);
    expect(serialized).not.toContain("cus_secret_should_not_leak");
    expect(serialized).not.toContain("sub_secret_should_not_leak");
    expect(serialized).not.toMatch(/password/i);
  });
});
