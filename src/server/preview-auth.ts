/**
 * Preview-only email confirmation bypass.
 * Production (VERCEL_ENV=production) always stays off, even if the flag is set.
 */
export function previewAutoVerifyEmail(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.VERCEL_ENV === "production") return false;
  if (env.VERCEL_ENV === "preview") return true;
  return env.PREVIEW_AUTO_VERIFY_EMAIL === "1";
}
