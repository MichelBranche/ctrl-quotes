/**
 * Public quote links: the only place that knows how a client URL is built.
 * The base address lives in one setting (PUBLIC_QUOTE_BASE_URL). Old hosts listed in
 * PUBLIC_QUOTE_LEGACY_HOSTS keep working through a 308 redirect that preserves path and token,
 * so moving to a dedicated domain never breaks a link already sent. The database stores only
 * the token hash, never a full URL.
 *
 * Pure functions, no env access: safe in proxy.ts, server code and tests.
 */

export type PublicUrlEnv = {
  PUBLIC_QUOTE_BASE_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  BETTER_AUTH_URL?: string;
  PUBLIC_QUOTE_LEGACY_HOSTS?: string;
  VERCEL_ENV?: string;
  [key: string]: string | undefined;
};

export const PUBLIC_QUOTE_PREFIX = "/q/";
const fallbackBase = "http://localhost:3000";

/** Origin only (scheme, host, port), lowercase, no trailing slash. Null when not a usable http(s) URL. */
export function normalizeBaseUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  return url.origin.toLowerCase();
}

/**
 * PUBLIC_QUOTE_BASE_URL, then NEXT_PUBLIC_APP_URL, then BETTER_AUTH_URL. In Vercel production
 * the result must be https: a plain-http link would leak the token on the wire.
 */
export function resolvePublicBaseUrl(env: PublicUrlEnv): string {
  const candidates = [env.PUBLIC_QUOTE_BASE_URL, env.NEXT_PUBLIC_APP_URL, env.BETTER_AUTH_URL];
  for (const raw of candidates) {
    const base = normalizeBaseUrl(raw);
    if (!base) continue;
    if (env.VERCEL_ENV === "production" && !base.startsWith("https://")) {
      throw new Error("In produzione l'indirizzo pubblico dei preventivi deve essere https.");
    }
    return base;
  }
  if (env.VERCEL_ENV === "production") {
    throw new Error("Imposta PUBLIC_QUOTE_BASE_URL (o NEXT_PUBLIC_APP_URL) in produzione.");
  }
  // Vercel Preview without settings: the deployment's own address, so a preview link opens the preview.
  const preview = env.VERCEL_ENV === "preview" ? normalizeBaseUrl(env.VERCEL_BRANCH_URL ? `https://${env.VERCEL_BRANCH_URL}` : env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined) : null;
  return preview ?? fallbackBase;
}

export function publicQuotePath(token: string): string {
  return `${PUBLIC_QUOTE_PREFIX}${token}`;
}

export function publicQuoteUrl(baseUrl: string, token: string): string {
  return `${baseUrl}${publicQuotePath(token)}`;
}

/** Comma or space separated hostnames, port allowed ("ctrl-quotes.vercel.app, old.example.com"). */
export function parseLegacyHosts(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((item) => item.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .filter((item) => item.length > 0);
}

/**
 * Where a request for an old public link should go, or null to serve it here.
 * Only client links (/q/...) move: the app itself keeps its own host and session cookies.
 */
export function legacyQuoteRedirect(requestUrl: URL, env: PublicUrlEnv): URL | null {
  if (!requestUrl.pathname.startsWith(PUBLIC_QUOTE_PREFIX)) return null;
  const legacy = parseLegacyHosts(env.PUBLIC_QUOTE_LEGACY_HOSTS);
  if (legacy.length === 0) return null;
  const host = requestUrl.host.toLowerCase();
  if (!legacy.includes(host)) return null;
  const base = normalizeBaseUrl(env.PUBLIC_QUOTE_BASE_URL);
  if (!base) return null;
  const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, base);
  if (target.host.toLowerCase() === host) return null;
  return target;
}
