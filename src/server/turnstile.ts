import "server-only";
import { turnstileConfig } from "@/server/auth-providers";

export const TURNSTILE_FIELD = "cf-turnstile-response";
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type Verify = { secretKey: string; token: string; remoteIP?: string; fetchImpl?: typeof fetch };

/**
 * One warning line per refused check, so login problems show up in the Vercel runtime logs.
 * Only Cloudflare's error codes and the hostname: never the token, the secret, the IP or the email.
 */
function logRefused(reason: string, detail: Record<string, unknown> = {}): void {
  console.warn("[turnstile] verifica rifiutata", { reason, ...detail });
}

/** Server-side Turnstile check. Fails closed: network errors, timeouts and odd answers all count as "no". */
export async function verifyTurnstileToken({ secretKey, token, remoteIP, fetchImpl = fetch }: Verify): Promise<boolean> {
  if (!token) {
    logRefused("token-mancante");
    return false;
  }
  if (token.length > 2048) {
    logRefused("token-troppo-lungo");
    return false;
  }
  try {
    const body = new URLSearchParams({ secret: secretKey, response: token });
    if (remoteIP) body.set("remoteip", remoteIP);
    const response = await fetchImpl(SITEVERIFY, { method: "POST", body, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      logRefused("siteverify-http", { status: response.status });
      return false;
    }
    const data = (await response.json()) as { success?: unknown; "error-codes"?: unknown; hostname?: unknown };
    if (data.success === true) return true;
    logRefused("cloudflare", {
      codes: Array.isArray(data["error-codes"]) ? data["error-codes"].map(String) : [],
      hostname: typeof data.hostname === "string" ? data.hostname : null,
    });
    return false;
  } catch (error) {
    logRefused("siteverify-irraggiungibile", { error: error instanceof Error ? error.name : "unknown" });
    return false;
  }
}

/** Used by the auth server actions. True when Turnstile is off (env missing) or the token is valid. */
export async function passesCaptcha(formData: FormData, remoteIP: string | undefined): Promise<boolean> {
  const config = turnstileConfig();
  if (!config) return true;
  const token = formData.get(TURNSTILE_FIELD);
  return verifyTurnstileToken({ secretKey: config.secretKey, token: typeof token === "string" ? token : "", remoteIP });
}
