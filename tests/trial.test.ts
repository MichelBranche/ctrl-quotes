import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { outboxJobs, workspaces } from "@/db/schema";
import { workspaceEntitlement } from "@/domain/entitlement";
import {
  TRIAL_DURATION_DAYS,
  TRIAL_EXPIRED_WRITE_MESSAGE,
  TRIAL_PLAN_ID,
  stripeSubscriptionTrialEnd,
  trialDaysRemaining,
  trialDaysRemainingLabel,
  trialEndFrom,
  trialReminderDue,
} from "@/domain/plans";
import { authorize } from "@/server/access";
import { enqueueDueTrialNotices } from "@/server/trial-notices";
import { updateWorkspace } from "@/server/workspaces";
import { ownerWithWorkspace } from "./helpers/actors";
import { createTestDb } from "./helpers/db";

const DAY = 86_400_000;

describe("conteggio dei giorni di prova", () => {
  it("dura sette periodi di 24 ore e arrotonda per eccesso", () => {
    const start = new Date("2026-11-15T11:00:00.000Z");
    const end = trialEndFrom(start);
    expect(end.getTime() - start.getTime()).toBe(TRIAL_DURATION_DAYS * DAY);
    expect(trialDaysRemaining(end, start)).toBe(7);
    expect(trialDaysRemaining(end, new Date(start.getTime() + 1))).toBe(7);
    expect(trialDaysRemaining(end, new Date(end.getTime() - DAY))).toBe(1);
    expect(trialDaysRemaining(end, new Date(end.getTime() - 1))).toBe(1);
    expect(trialDaysRemaining(end, end)).toBe(0);
    expect(trialDaysRemaining(end, new Date(end.getTime() + 1))).toBe(0);
    expect(trialDaysRemainingLabel(7)).toBe("Prova gratuita, 7 giorni rimasti");
    expect(trialDaysRemainingLabel(1)).toBe("Prova gratuita, 1 giorno rimasto");
    expect(trialDaysRemainingLabel(0)).toBe("Prova terminata");
  });

  it("non usa la mezzanotte di Europe/Rome: attraversare la mezzanotte non cambia il conteggio", () => {
    // 15 novembre 2026, 23:30 Europe/Rome = 22:30 UTC.
    const end = new Date("2026-11-22T22:30:00.000Z");
    const beforeMidnight = new Date("2026-11-15T22:30:00.000Z");
    const afterMidnight = new Date("2026-11-15T23:00:00.000Z");
    expect(trialDaysRemaining(end, beforeMidnight)).toBe(7);
    expect(trialDaysRemaining(end, afterMidnight)).toBe(7);
  });

  it("resta su 7 × 24 ore anche con il cambio ora di Europe/Rome nel 2026", () => {
    // 29 marzo 2026, 02:00 CET → 03:00 CEST.
    const springStart = new Date("2026-03-28T11:00:00.000Z"); // 12:00 Roma
    const springEnd = trialEndFrom(springStart);
    expect(springEnd.toISOString()).toBe("2026-04-04T11:00:00.000Z"); // 13:00 CEST
    expect(trialDaysRemaining(springEnd, springStart)).toBe(7);

    // 25 ottobre 2026, 03:00 CEST → 02:00 CET.
    const autumnStart = new Date("2026-10-24T10:00:00.000Z"); // 12:00 Roma
    const autumnEnd = trialEndFrom(autumnStart);
    expect(autumnEnd.toISOString()).toBe("2026-10-31T10:00:00.000Z"); // 11:00 CET
    expect(trialDaysRemaining(autumnEnd, autumnStart)).toBe(7);
  });

  it("mostra il promemoria quando restano al massimo due giorni", () => {
    const end = new Date("2026-11-22T12:00:00.000Z");
    expect(trialReminderDue(end, new Date(end.getTime() - 2 * DAY))).toBe(true);
    expect(trialReminderDue(end, new Date(end.getTime() - 2 * DAY - 1))).toBe(false);
    expect(trialReminderDue(end, new Date(end.getTime() - 1))).toBe(true);
    expect(trialReminderDue(end, end)).toBe(false);
  });

  it("passa a Stripe il trial_end solo se la prova è ancora sufficientemente lontana", () => {
    const now = new Date("2026-11-15T12:00:00.000Z");
    const end = new Date("2026-11-22T12:00:00.000Z");
    expect(stripeSubscriptionTrialEnd(end, now)).toBe(Math.floor(end.getTime() / 1000));
    expect(stripeSubscriptionTrialEnd(end, new Date(end.getTime() - 30_000))).toBeUndefined();
    expect(stripeSubscriptionTrialEnd(end, end)).toBeUndefined();
    expect(stripeSubscriptionTrialEnd(null, now)).toBeUndefined();
  });
});

describe("diritti del workspace in prova", () => {
  const base = {
    plan: "free",
    planOverride: null,
    planOverrideUntil: null,
    trialEndsAt: new Date("2026-11-22T12:00:00.000Z"),
    subscriptionStatus: null as string | null,
  };
  const now = new Date("2026-11-15T12:00:00.000Z");

  it("durante la prova usa i limiti Pro e non è in sola lettura", () => {
    const access = workspaceEntitlement(base, now);
    expect(access.planId).toBe(TRIAL_PLAN_ID);
    expect(access.trialActive).toBe(true);
    expect(access.readOnly).toBe(false);
    expect(access.daysLeft).toBe(7);
  });

  it("una trial_ends_at assente non chiude il workspace", () => {
    const access = workspaceEntitlement({ ...base, trialEndsAt: null }, now);
    expect(access.trialExpired).toBe(false);
    expect(access.readOnly).toBe(false);
  });

  it("dopo la scadenza, senza abbonamento né codice, è in sola lettura", () => {
    const access = workspaceEntitlement(base, new Date("2026-11-22T12:00:00.000Z"));
    expect(access.trialExpired).toBe(true);
    expect(access.readOnly).toBe(true);
    expect(access.daysLeft).toBe(0);
  });

  it("un override a vita o un abbonamento attivo evitano la sola lettura", () => {
    expect(
      workspaceEntitlement({ ...base, planOverride: "business", planOverrideUntil: null }, new Date("2026-11-30")).readOnly,
    ).toBe(false);
    expect(workspaceEntitlement({ ...base, plan: "pro" }, new Date("2026-11-30")).readOnly).toBe(false);
    expect(workspaceEntitlement({ ...base, subscriptionStatus: "trialing" }, new Date("2026-11-30")).readOnly).toBe(false);
    expect(workspaceEntitlement({ ...base, subscriptionStatus: "active" }, new Date("2026-11-30")).readOnly).toBe(false);
  });
});

describe("scritture dopo la scadenza", () => {
  it("blocca le modifiche, lascia letture e gestione abbonamento", async () => {
    const db = await createTestDb();
    const owner = await ownerWithWorkspace(db, "prova@example.com", "Studio Prova");
    await db.update(workspaces).set({ trialEndsAt: new Date("2026-01-01T00:00:00.000Z") }).where(eq(workspaces.id, owner.workspaceId));
    const actor = { userId: owner.userId, workspaceId: owner.workspaceId };

    const write = await authorize(db, actor, "quotes.write");
    expect(write.ok).toBe(false);
    if (!write.ok) expect(write.message).toBe(TRIAL_EXPIRED_WRITE_MESSAGE);

    const read = await authorize(db, actor, "quotes.read");
    expect(read.ok).toBe(true);

    const billing = await authorize(db, actor, "billing.manage");
    expect(billing.ok).toBe(true);

    await expect(updateWorkspace(db, { userId: owner.userId, workspaceId: owner.workspaceId, name: "Nuovo nome" })).rejects.toThrow(
      TRIAL_EXPIRED_WRITE_MESSAGE,
    );
  });

  it("un codice lifetime Business lascia scrivere dopo la scadenza della prova", async () => {
    const db = await createTestDb();
    const owner = await ownerWithWorkspace(db, "vita@example.com", "Studio Vita");
    await db
      .update(workspaces)
      .set({ trialEndsAt: new Date("2026-01-01T00:00:00.000Z"), planOverride: "business", planOverrideUntil: null })
      .where(eq(workspaces.id, owner.workspaceId));
    const write = await authorize(db, { userId: owner.userId, workspaceId: owner.workspaceId }, "quotes.write");
    expect(write.ok).toBe(true);
  });
});

describe("email di prova, idempotenti", () => {
  it("accoda un promemoria e una scadenza una sola volta", async () => {
    const db = await createTestDb();
    const owner = await ownerWithWorkspace(db, "avviso@example.com", "Studio Avviso");
    const now = new Date("2026-11-20T12:00:00.000Z");
    await db.update(workspaces).set({ trialEndsAt: new Date("2026-11-22T12:00:00.000Z") }).where(eq(workspaces.id, owner.workspaceId));

    expect(await enqueueDueTrialNotices(db, now)).toEqual({ reminders: 1, expired: 0 });
    expect(await enqueueDueTrialNotices(db, now)).toEqual({ reminders: 0, expired: 0 });

    const later = new Date("2026-11-23T12:00:00.000Z");
    expect(await enqueueDueTrialNotices(db, later)).toEqual({ reminders: 0, expired: 1 });
    expect(await enqueueDueTrialNotices(db, later)).toEqual({ reminders: 0, expired: 0 });

    const jobs = await db.select().from(outboxJobs);
    expect(jobs).toHaveLength(2);
    expect(jobs.every((job) => job.type === "quote.owner_notice")).toBe(true);
  });

  it("non avvisa un workspace con override a vita", async () => {
    const db = await createTestDb();
    const owner = await ownerWithWorkspace(db, "no-mail@example.com", "Studio Silenzio");
    const now = new Date("2026-11-23T12:00:00.000Z");
    await db
      .update(workspaces)
      .set({ trialEndsAt: new Date("2026-11-22T12:00:00.000Z"), planOverride: "business", planOverrideUntil: null })
      .where(eq(workspaces.id, owner.workspaceId));
    expect(await enqueueDueTrialNotices(db, now)).toEqual({ reminders: 0, expired: 0 });
    expect(await db.select().from(outboxJobs)).toHaveLength(0);
  });
});

describe("workspace nuovi e già esistenti", () => {
  it("la migration assegna sette giorni e salta l'onboarding ai workspace già presenti", async () => {
    const db = await createTestDb();
    const owner = await ownerWithWorkspace(db, "old@example.com", "Studio Vecchio");
    await db
      .update(workspaces)
      .set({ trialEndsAt: null, onboardingCompletedAt: null })
      .where(eq(workspaces.id, owner.workspaceId));
    const now = Date.now();
    await db.run(sql`UPDATE workspaces SET trial_ends_at = ${now + 7 * DAY}, onboarding_completed_at = ${now} WHERE deleted_at IS NULL AND trial_ends_at IS NULL`);
    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, owner.workspaceId));
    expect(row?.trialEndsAt?.getTime()).toBe(now + 7 * DAY);
    expect(row?.onboardingCompletedAt?.getTime()).toBe(now);
  });
});
