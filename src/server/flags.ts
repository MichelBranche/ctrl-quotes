import "server-only";

/**
 * Editor visuale, in preview until Michel approves it. Read on every request, so the e2e server
 * can turn it on without a dedicated build: EDITOR_VISUALE=1 at runtime, or
 * NEXT_PUBLIC_EDITOR_VISUALE=1 at build time (set on the Vercel Preview environment only).
 */
export function editorVisualeEnabled(): boolean {
  return process.env.EDITOR_VISUALE === "1" || process.env.NEXT_PUBLIC_EDITOR_VISUALE === "1";
}
