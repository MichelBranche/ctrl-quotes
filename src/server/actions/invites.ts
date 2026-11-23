"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ensureMigrated, getDb } from "@/db/client";
import { isWellFormedToken } from "@/server/link-token";
import { acceptInvite, markWelcomed } from "@/server/invites";
import { inviteWelcomePath } from "@/server/onboarding-path";
import { clearInviteCookie, rememberInviteToken } from "@/server/invite-cookie";
import { requireUser, workspaceCookieOptions } from "@/server/session";

export type InviteActionState = { error?: string };

export async function rememberInviteTokenAction(token: string): Promise<void> {
  await rememberInviteToken(token);
}

export async function acceptInviteAction(_state: InviteActionState, formData: FormData): Promise<InviteActionState> {
  await ensureMigrated();
  const session = await requireUser();
  const token = String(formData.get("token") ?? "");
  if (!isWellFormedToken(token)) return { error: "Invito non valido o scaduto." };
  const result = await acceptInvite(getDb(), { userId: session.user.id, token });
  if (!result.ok) return { error: result.message };
  const jar = await cookies();
  jar.set("cq_workspace", result.value.workspaceId, await workspaceCookieOptions());
  await clearInviteCookie();
  redirect(inviteWelcomePath(result.value.workspaceId));
}

/** The invite link is dead (expired, revoked, used): forget it so later logins do not bounce back here. */
export async function forgetInviteTokenAction(): Promise<void> {
  await clearInviteCookie();
}

/** End (or skip) of the invited-member welcome tour: mark it seen and open the invited workspace. */
export async function finishInviteWelcomeAction(workspaceId: string, target: "overview" | "quote" = "overview"): Promise<void> {
  await ensureMigrated();
  const session = await requireUser();
  const marked = await markWelcomed(getDb(), session.user.id, workspaceId);
  if (marked) {
    const jar = await cookies();
    jar.set("cq_workspace", workspaceId, await workspaceCookieOptions());
  }
  await clearInviteCookie();
  redirect(target === "quote" ? "/app/quotes/new" : "/app/overview");
}
