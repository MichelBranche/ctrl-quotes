"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { workspaces } from "@/db/schema";
import { trialEndFrom } from "@/domain/plans";
import { templateIdFor, templateKeys, type TemplateKey } from "@/domain/templates";
import { writeAuditLog } from "@/server/audit";
import { createCatalogItem } from "@/server/catalog";
import { requireContext } from "@/server/context";
import { pathAfterAuth, setupWorkspaceFor } from "@/server/onboarding-path";
import { requireUser, workspaceCookieOptions } from "@/server/session";
import { defaultBrand, loadBrand, saveBrand } from "@/server/settings";
import { setDefaultTemplate } from "@/server/templates";
import { createWorkspace, listWorkspaces } from "@/server/workspaces";
import { getDb } from "@/db/client";

const STEPS = 4;

export type ReusableBrand = { workspaceId: string; workspaceName: string; companyName: string | null; colorPrimary: string };

export async function listReusableBrandsAction(): Promise<ReusableBrand[]> {
  const session = await requireUser();
  const current = await setupWorkspaceFor(session.user.id);
  const all = await listWorkspaces(getDb(), session.user.id);
  const out: ReusableBrand[] = [];
  for (const item of all) {
    if (current && item.id === current.id) continue;
    const brand = await loadBrand(getDb(), item.id);
    if (!brand.companyName && brand.colorPrimary === defaultBrand.colorPrimary) continue;
    out.push({
      workspaceId: item.id,
      workspaceName: item.name,
      companyName: brand.companyName,
      colorPrimary: brand.colorPrimary,
    });
  }
  return out;
}

/** Starts the 7-day trial at the moment the user accepts. Creates the first workspace if needed. */
export async function acceptTrialAction(): Promise<void> {
  const session = await requireUser();
  const existing = await listWorkspaces(getDb(), session.user.id);
  const jar = await cookies();
  if (existing.length > 0) {
    const requested = jar.get("cq_workspace")?.value;
    const active = existing.find((item) => item.id === requested) ?? existing[0];
    if (active.onboardingCompletedAt) redirect("/app/overview");
    if (!active.trialEndsAt) {
      const now = new Date();
      await getDb()
        .update(workspaces)
        .set({ trialEndsAt: trialEndFrom(now), updatedAt: now })
        .where(eq(workspaces.id, active.id));
    }
    jar.set("cq_workspace", active.id, await workspaceCookieOptions());
    redirect("/onboarding/setup");
  }

  const name = session.user.name?.trim() || "Il mio studio";
  const workspace = await createWorkspace(getDb(), {
    userId: session.user.id,
    name: name.length >= 2 ? name.slice(0, 80) : "Il mio studio",
    taxProfile: "ordinario",
    startTrial: true,
    skipOnboarding: false,
  });
  await writeAuditLog(getDb(), {
    workspaceId: workspace.id,
    actorUserId: session.user.id,
    action: "workspace.created",
    entityType: "workspace",
    entityId: workspace.id,
    meta: { trial: "accepted" },
  });
  jar.set("cq_workspace", workspace.id, await workspaceCookieOptions());
  redirect("/onboarding/setup");
}

async function requireSetup() {
  const session = await requireUser();
  const workspace = await setupWorkspaceFor(session.user.id);
  if (!workspace) redirect(await pathAfterAuth(session.user.id));
  return { session, workspace, db: getDb() };
}

export async function saveOnboardingBrandAction(input: {
  companyName: string;
  colorPrimary: string;
  reuseFromWorkspaceId?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { workspace } = await requireSetup();
  const { db, actor } = await requireContext();
  let payload: Parameters<typeof saveBrand>[2];
  if (input.reuseFromWorkspaceId) {
    const allowed = (await listWorkspaces(db, actor.userId)).some((item) => item.id === input.reuseFromWorkspaceId);
    if (!allowed) return { ok: false, message: "Brand Kit non trovato." };
    const source = await loadBrand(db, input.reuseFromWorkspaceId);
    payload = {
      companyName: source.companyName,
      vatNumber: source.vatNumber,
      taxCode: source.taxCode,
      address: source.address,
      email: source.email,
      phone: source.phone,
      website: source.website,
      colorPrimary: source.colorPrimary,
      colorSecondary: source.colorSecondary,
      colorBackground: source.colorBackground,
      fontHeading: source.fontHeading,
      fontBody: source.fontBody,
      applyAutomatically: true,
    };
  } else {
    const name = input.companyName.trim();
    if (name.length < 2) return { ok: false, message: "Inserisci il nome del brand." };
    const current = await loadBrand(db, workspace.id);
    payload = {
      companyName: name,
      vatNumber: current.vatNumber,
      taxCode: current.taxCode,
      address: current.address,
      email: current.email,
      phone: current.phone,
      website: current.website,
      colorPrimary: input.colorPrimary,
      colorSecondary: current.colorSecondary,
      colorBackground: current.colorBackground,
      fontHeading: current.fontHeading,
      fontBody: current.fontBody,
      applyAutomatically: true,
    };
  }
  const result = await saveBrand(db, actor, payload);
  if (!result.ok) return { ok: false, message: result.message };
  await advanceStep(db, workspace.id, 1);
  return { ok: true };
}

export async function saveOnboardingTemplateAction(templateKey: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { workspace } = await requireSetup();
  if (!(templateKeys as readonly string[]).includes(templateKey)) return { ok: false, message: "Template non valido." };
  const { db, actor } = await requireContext();
  const result = await setDefaultTemplate(db, actor, templateIdFor(templateKey as TemplateKey));
  if (!result.ok) return { ok: false, message: result.message };
  await advanceStep(db, workspace.id, 2);
  return { ok: true };
}

export async function saveOnboardingServiceAction(input: {
  name: string;
  priceEuro: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { workspace } = await requireSetup();
  const { db, actor } = await requireContext();
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, message: "Inserisci il nome del servizio." };
  const euro = Number(input.priceEuro.replace(",", "."));
  if (!Number.isFinite(euro) || euro < 0) return { ok: false, message: "Inserisci un prezzo valido." };
  const result = await createCatalogItem(db, actor, {
    type: "servizio",
    name,
    description: null,
    unit: null,
    unitPriceCents: Math.round(euro * 100),
    priceMode: "net",
    taxRateBp: 2200,
    taxNature: null,
    billing: "una_tantum",
    periods: null,
    optionalDefault: false,
    categoryId: null,
    components: [],
  });
  if (!result.ok) return { ok: false, message: result.message };
  await advanceStep(db, workspace.id, 3);
  return { ok: true };
}

export async function skipOnboardingStepAction(fromStep: number): Promise<void> {
  const { workspace, db } = await requireSetup();
  const next = Math.min(STEPS - 1, Math.max(0, fromStep) + 1);
  if (fromStep >= STEPS - 1) {
    await completeOnboarding(db, workspace.id);
    redirect("/app/overview");
  }
  await advanceStep(db, workspace.id, next);
  refresh();
}

export async function completeOnboardingAction(next: "overview" | "quote" = "overview"): Promise<void> {
  const { workspace, db } = await requireSetup();
  await completeOnboarding(db, workspace.id);
  redirect(next === "quote" ? "/app/quotes/new" : "/app/overview");
}

async function advanceStep(db: ReturnType<typeof getDb>, workspaceId: string, step: number) {
  await db
    .update(workspaces)
    .set({ onboardingStep: step, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));
}

async function completeOnboarding(db: ReturnType<typeof getDb>, workspaceId: string) {
  const now = new Date();
  await db
    .update(workspaces)
    .set({ onboardingCompletedAt: now, onboardingStep: STEPS, updatedAt: now })
    .where(eq(workspaces.id, workspaceId));
}
