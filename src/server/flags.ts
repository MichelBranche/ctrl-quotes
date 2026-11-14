import "server-only";

/**
 * Editor visuale, in preview until Michel approves it. Read on every request, so the e2e server
 * can turn it on without a dedicated build: EDITOR_VISUALE=1 at runtime, or
 * NEXT_PUBLIC_EDITOR_VISUALE=1 at build time (set on the Vercel Preview environment only).
 */
export function editorVisualeEnabled(): boolean {
  return process.env.EDITOR_VISUALE === "1" || process.env.NEXT_PUBLIC_EDITOR_VISUALE === "1";
}

/**
 * Phase 4 sending. On in development, tests and Vercel Preview; off in Production until the client
 * page (PR F3) exists, so no real client receives a link that does not open yet.
 * QUOTE_SENDING=1 turns it on anywhere, QUOTE_SENDING=0 turns it off anywhere.
 */
export function quoteSendingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.QUOTE_SENDING === "1") return true;
  if (env.QUOTE_SENDING === "0") return false;
  return env.VERCEL_ENV !== "production";
}
