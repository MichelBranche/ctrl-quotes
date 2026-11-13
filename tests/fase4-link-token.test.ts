import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  deriveSubkey,
  generateLinkToken,
  hashLinkToken,
  ipFingerprint,
  isWellFormedToken,
  linkRootKey,
  openToken,
  romeDay,
  sealToken,
  tokenHint,
} from "@/server/link-token";

describe("token dei link pubblici", () => {
  it("ha 43 caratteri base64url, cioè 256 bit casuali", () => {
    const token = generateLinkToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(isWellFormedToken(token)).toBe(true);
  });

  it("non si ripete su 5000 estrazioni", () => {
    const seen = new Set(Array.from({ length: 5000 }, generateLinkToken));
    expect(seen.size).toBe(5000);
  });

  it("scarta forme sbagliate prima del database", () => {
    for (const value of ["", "abc", `${generateLinkToken()}x`, "a".repeat(42) + "=", "../../etc/passwd", 42, null, undefined]) {
      expect(isWellFormedToken(value)).toBe(false);
    }
  });

  it("hash SHA-256 stabile, diverso per token diversi, mai uguale al token", () => {
    const token = generateLinkToken();
    expect(hashLinkToken(token)).toBe(hashLinkToken(token));
    expect(hashLinkToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashLinkToken(token)).not.toBe(hashLinkToken(generateLinkToken()));
    expect(hashLinkToken(token)).not.toContain(token);
  });

  it("l'indizio mostra solo gli ultimi 4 caratteri", () => {
    const token = generateLinkToken();
    expect(tokenHint(token)).toBe(token.slice(-4));
    expect(tokenHint(token)).toHaveLength(4);
  });

  it("cifra e decifra: il testo cifrato non contiene il token e cambia ogni volta", () => {
    const key = randomBytes(32);
    const token = generateLinkToken();
    const a = sealToken(token, key);
    const b = sealToken(token, key);
    expect(a).not.toBe(b);
    expect(a).not.toContain(token);
    expect(a.split(".")).toHaveLength(4);
    expect(openToken(a, key)).toBe(token);
    expect(openToken(b, key)).toBe(token);
  });

  it("con un'altra chiave o un testo alterato restituisce null", () => {
    const key = randomBytes(32);
    const sealed = sealToken(generateLinkToken(), key);
    expect(openToken(sealed, randomBytes(32))).toBeNull();
    const parts = sealed.split(".");
    const body = Buffer.from(parts[3]!, "base64url");
    body[0] = body[0]! ^ 0xff;
    expect(openToken([parts[0], parts[1], parts[2], body.toString("base64url")].join("."), key)).toBeNull();
    expect(openToken("v2.x.y.z", key)).toBeNull();
    expect(openToken(null, key)).toBeNull();
    expect(openToken("", key)).toBeNull();
  });

  it("QUOTE_LINK_KEY accetta hex o base64 da 32 byte e rifiuta il resto", () => {
    const raw = randomBytes(32);
    expect(linkRootKey({ QUOTE_LINK_KEY: raw.toString("hex") }).equals(raw)).toBe(true);
    expect(linkRootKey({ QUOTE_LINK_KEY: raw.toString("base64") }).equals(raw)).toBe(true);
    expect(linkRootKey({ QUOTE_LINK_KEY: raw.toString("base64url") }).equals(raw)).toBe(true);
    expect(() => linkRootKey({ QUOTE_LINK_KEY: "corta" })).toThrow(/32 byte/);
  });

  it("senza QUOTE_LINK_KEY deriva una chiave stabile dal secret di Better Auth", () => {
    const env = { BETTER_AUTH_SECRET: "x".repeat(40) };
    const previous = process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_SECRET = env.BETTER_AUTH_SECRET;
    try {
      const a = linkRootKey({});
      const b = linkRootKey({});
      expect(a).toHaveLength(32);
      expect(a.equals(b)).toBe(true);
      expect(a.toString("utf8")).not.toContain("xxxx");
    } finally {
      if (previous === undefined) delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = previous;
    }
  });

  it("sottochiavi diverse per scopi diversi", () => {
    const root = randomBytes(32);
    const seal = deriveSubkey("seal", root);
    expect(seal.equals(deriveSubkey("ip", root))).toBe(false);
    expect(seal.equals(deriveSubkey("rate", root))).toBe(false);
    expect(seal.equals(root)).toBe(false);
  });

  it("impronta dell'IP: stabile nello stesso giorno, diversa il giorno dopo, mai l'IP in chiaro", () => {
    const key = randomBytes(32);
    const day = romeDay(new Date("2026-11-14T10:00:00Z"));
    expect(day).toBe("2026-11-14");
    const a = ipFingerprint("203.0.113.7", day, key);
    expect(a).toBe(ipFingerprint("203.0.113.7", day, key));
    expect(a).not.toBe(ipFingerprint("203.0.113.7", "2026-11-15", key));
    expect(a).not.toBe(ipFingerprint("203.0.113.8", day, key));
    expect(a).not.toContain("203");
    expect(romeDay(new Date("2026-11-14T23:30:00Z"))).toBe("2026-11-15");
  });
});
