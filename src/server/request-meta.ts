import "server-only";

/** Client IP as seen by Vercel. Only used for rate limits, fingerprints and the acceptance record. */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

export type DeviceClass = "telefono" | "tablet" | "computer";

/** Coarse device class for the timeline. The full user agent is stored only with an acceptance. */
export function deviceClass(userAgent: string | null): DeviceClass {
  const ua = userAgent ?? "";
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|Android/i.test(ua)) return "telefono";
  return "computer";
}

/** User agent capped in length before storage. */
export function storedUserAgent(userAgent: string | null): string | null {
  return userAgent ? userAgent.slice(0, 512) : null;
}

/**
 * Cross-site check for JSON/binary POSTs: a browser always sends Origin on them. Without Origin
 * (server-to-server, tests) the request goes through; with a foreign Origin it is refused.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || new URL(request.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
