import "server-only";
import { turnstileConfig } from "@/server/auth-providers";

export const TURNSTILE_FIELD = "cf-turnstile-response";
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type Verify = { secretKey: string; token: string; remoteIP?: string; fetchImpl?: typeof fetch };

/** Server-side Turnstile check. Fails closed: network errors, timeouts and odd answers all count as "no". */
export async function verifyTurnstileToken({ secretKey, token, remoteIP, fetchImpl = fetch }: Verify): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret: secretKey, response: token });
    if (remoteIP) body.set("remoteip", remoteIP);
    const response = await fetchImpl(SITEVERIFY, { method: "POST", body, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return false;
    const data = (await response.json()) as { success?: unknown };
    return data.success === true;
  } catch {
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
