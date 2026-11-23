import "server-only";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ensureMigrated, getDb } from "@/db/client";
import type { ShellData } from "@/components/shell/types";
import { getAuth } from "@/server/auth";
import { listNotifications } from "@/server/notifications";
import { loadWorkspaceEntitlement } from "@/server/entitlement";
import { listWorkspaces } from "@/server/workspaces";

export async function readSession() {
  await connection();
  await ensureMigrated();
  return getAuth().api.getSession({ headers: await headers() });
}

export async function requireUser() {
  const session = await readSession();
  if (session) return session;
  const jar = await cookies();
  const stale = jar.getAll().some((cookie) => cookie.name.includes("session_token"));
  redirect(stale ? "/session-expired" : "/login");
}

function initials(name: string): string {
  const letters = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "U";
}

export async function loadShell(): Promise<ShellData> {
  const session = await requireUser();
  const workspaces = await listWorkspaces(getDb(), session.user.id);
  const workspace = workspaces[0];
  if (!workspace) redirect("/onboarding/trial");
  const requested = (await cookies()).get("cq_workspace")?.value;
  const chosen = workspaces.find((item) => item.id === requested) ?? workspace;
  if (chosen.role !== "owner" && chosen.welcomedAt == null) redirect(`/onboarding/invito?w=${encodeURIComponent(chosen.id)}`);
  if (!chosen.onboardingCompletedAt && chosen.role === "owner") redirect("/onboarding/setup");
  const access = await loadWorkspaceEntitlement(getDb(), chosen);
  return {
    user: {
      name: session.user.name,
      email: session.user.email,
      initials: initials(session.user.name),
    },
    workspace: {
      id: chosen.id,
      name: chosen.name,
      plan: chosen.plan,
      planOverride: chosen.planOverride,
      trialEndsAt: access.trialEndsAt ? access.trialEndsAt.getTime() : null,
      trialDaysLeft: access.daysLeft,
      trialActive: access.trialActive,
      trialExpired: access.trialExpired,
      showReminderBanner: access.showReminderBanner,
    },
    workspaces: workspaces.map((item) => ({ id: item.id, name: item.name, role: item.role })),
    notifications: await listNotifications(getDb(), session.user.id, chosen.id),
  };
}

export async function workspaceCookieOptions() {
  const secure = (process.env.BETTER_AUTH_URL ?? "").startsWith("https:");
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}
