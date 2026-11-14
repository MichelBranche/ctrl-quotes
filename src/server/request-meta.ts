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
