"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ensureMigrated, getDb } from "@/db/client";
import { isWellFormedToken } from "@/server/link-token";
import { acceptInvite } from "@/server/invites";
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
  redirect("/app/overview");
}
