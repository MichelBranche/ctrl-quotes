/**
 * Optional auth add-ons, switched on only when their env is complete.
 * Missing or partial env never crashes: the feature simply stays off.
 */

type Env = Record<string, string | undefined>;

export type GoogleConfig = { clientId: string; clientSecret: string };
export type TurnstileConfig = { siteKey: string; secretKey: string };

/** Endpoints guarded by Turnstile, both on the public HTTP API and in the server actions. */
export const CAPTCHA_ENDPOINTS = ["/sign-in/email", "/sign-up/email", "/request-password-reset", "/reset-password"] as const;

function value(env: Env, key: string): string | undefined {
  const raw = env[key]?.trim();
  return raw ? raw : undefined;
}

export function googleConfig(env: Env = process.env): GoogleConfig | null {
  const clientId = value(env, "GOOGLE_CLIENT_ID");
  const clientSecret = value(env, "GOOGLE_CLIENT_SECRET");
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function turnstileConfig(env: Env = process.env): TurnstileConfig | null {
  const siteKey = value(env, "NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  const secretKey = value(env, "TURNSTILE_SECRET_KEY");
  return siteKey && secretKey ? { siteKey, secretKey } : null;
}

/** What the auth pages need to render: never the secrets. */
export type AuthUiConfig = { google: boolean; turnstileSiteKey: string | null };

export function authUiConfig(env: Env = process.env): AuthUiConfig {
  return { google: googleConfig(env) !== null, turnstileSiteKey: turnstileConfig(env)?.siteKey ?? null };
}
