import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time comparison (hashes first so lengths never leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Bearer check for internal read-only routes.
 * "unconfigured" when the secret env is missing or shorter than 16 characters.
 */
export function bearerAuth(header: string | null, secret: string | undefined): "ok" | "unauthorized" | "unconfigured" {
  const s = secret?.trim();
  if (!s || s.length < 16) return "unconfigured";
  const m = /^Bearer\s+(.+)$/i.exec(header?.trim() ?? "");
  return m && safeEqual(m[1].trim(), s) ? "ok" : "unauthorized";
}
