import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { resolveAuthSecret } from "@/server/secret";

/**
 * Tokens of the public quote links.
 * - 32 random bytes, 43 base64url characters in the URL (256 bit).
 * - The database keeps the SHA-256 hash for lookups and an AES-256-GCM copy for "Copia link".
 * - Key: QUOTE_LINK_KEY (32 bytes, base64/base64url or 64 hex). Without it the key is derived with
 *   HKDF from BETTER_AUTH_SECRET, already mandatory outside localhost, so no new secret is required.
 */

export const LINK_TOKEN_BYTES = 32;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const SEAL_VERSION = "v1";

export function generateLinkToken(): string {
  return randomBytes(LINK_TOKEN_BYTES).toString("base64url");
}

/** Cheap shape check before touching the database. */
export function isWellFormedToken(value: unknown): value is string {
  return typeof value === "string" && tokenPattern.test(value);
}

export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Last 4 characters, only to recognise a link on screen. Never enough to guess it. */
export function tokenHint(token: string): string {
  return token.slice(-4);
}

function parseKey(raw: string): Buffer {
  const value = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, "hex");
  const decoded = Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (decoded.length !== 32) {
    throw new Error("QUOTE_LINK_KEY deve contenere 32 byte (64 caratteri hex oppure base64).");
  }
  return decoded;
}

/** Root key for everything link related. Subkeys are derived per purpose. */
export function linkRootKey(env: Record<string, string | undefined> = process.env): Buffer {
  if (env.QUOTE_LINK_KEY) return parseKey(env.QUOTE_LINK_KEY);
  return Buffer.from(hkdfSync("sha256", resolveAuthSecret(), "ctrl-quotes", "quote-link-root/v1", 32));
}

export function deriveSubkey(purpose: "seal" | "ip" | "rate", root: Buffer = linkRootKey()): Buffer {
  return Buffer.from(hkdfSync("sha256", root, "ctrl-quotes", `quote-link-${purpose}/v1`, 32));
}

function keyId(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

/** "v1.<keyId>.<iv>.<ciphertext+tag>", all base64url. The key id says which key sealed it. */
export function sealToken(token: string, key: Buffer = deriveSubkey("seal")): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return [SEAL_VERSION, keyId(key), iv.toString("base64url"), body.toString("base64url")].join(".");
}

/** Plain token, or null when the value was sealed with another key or was tampered with. */
export function openToken(sealed: string | null | undefined, key: Buffer = deriveSubkey("seal")): string | null {
  if (!sealed) return null;
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== SEAL_VERSION) return null;
  const [, kid, ivRaw, bodyRaw] = parts as [string, string, string, string];
  const expected = Buffer.from(keyId(key));
  const given = Buffer.from(kid);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const iv = Buffer.from(ivRaw, "base64url");
  const body = Buffer.from(bodyRaw, "base64url");
  if (iv.length !== 12 || body.length <= 16) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(body.subarray(body.length - 16));
    const plain = Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()]).toString("utf8");
    return isWellFormedToken(plain) ? plain : null;
  } catch {
    return null;
  }
}

/**
 * Fingerprint of a client IP for view counting: HMAC with a daily salt, so the same visitor
 * is recognised within a day and nothing reversible is stored. Day is the Rome calendar day.
 */
export function ipFingerprint(ip: string, day: string, key: Buffer = deriveSubkey("ip")): string {
  return createHmac("sha256", key).update(`${day}|${ip}`).digest("hex").slice(0, 32);
}

export function romeDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
