/** Public invite links: `/invite/` plus the 43-character base64url token from generateLinkToken. */
export const INVITE_PATH_PREFIX = "/invite/";
export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function invitePath(token: string): string {
  return `${INVITE_PATH_PREFIX}${token}`;
}

/** Only a well-formed invite path is a safe post-login redirect. Anything else is ignored. */
export function safeInvitePath(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith(INVITE_PATH_PREFIX) || trimmed.includes("\\") || trimmed.includes("//")) return null;
  const token = trimmed.slice(INVITE_PATH_PREFIX.length);
  if (token.includes("/") || token.includes("?") || token.includes("#")) return null;
  if (!INVITE_TOKEN_PATTERN.test(token)) return null;
  return `${INVITE_PATH_PREFIX}${token}`;
}

export function inviteTokenFromPath(path: string): string | null {
  const safe = safeInvitePath(path);
  return safe ? safe.slice(INVITE_PATH_PREFIX.length) : null;
}
