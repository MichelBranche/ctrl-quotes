import "server-only";
import { cookies } from "next/headers";
import { INVITE_TTL_MS } from "@/server/email/invite";
import { isWellFormedToken } from "@/server/link-token";
import { invitePath, safeInvitePath } from "@/domain/invite-path";

export const INVITE_COOKIE = "cq_invite";

export async function inviteCookieOptions() {
  const secure = (process.env.BETTER_AUTH_URL ?? "").startsWith("https:");
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: Math.floor(INVITE_TTL_MS / 1000),
  };
}

export async function rememberInviteToken(token: string): Promise<void> {
  if (!isWellFormedToken(token)) return;
  const jar = await cookies();
  jar.set(INVITE_COOKIE, token, await inviteCookieOptions());
}

export async function readInviteCookiePath(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(INVITE_COOKIE)?.value;
  if (!isWellFormedToken(token)) return null;
  return invitePath(token);
}

export async function clearInviteCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(INVITE_COOKIE, "", { ...(await inviteCookieOptions()), maxAge: 0 });
}

/** Prefer the form field, then the invite cookie. Anything else is ignored. */
export function resolveInviteNext(formNext: string | null | undefined, cookiePath: string | null): string | null {
  return safeInvitePath(formNext) ?? cookiePath;
}
