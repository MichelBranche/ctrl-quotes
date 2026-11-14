import { afterEach, describe, expect, it, vi } from "vitest";
import { redact, safeLog } from "@/server/redact";
import { generateLinkToken } from "@/server/link-token";
import { clientIp, deviceClass, storedUserAgent } from "@/server/request-meta";

describe("log senza dati personali", () => {
  afterEach(() => vi.restoreAllMocks());

  it("toglie token, email, IP e stringhe segrete", () => {
    const token = generateLinkToken();
    const line = redact(`GET /q/${token}/pdf da 203.0.113.7 e 2001:db8::1 per luca.ferri@atelier.example chiave ${"a".repeat(40)}`);
    expect(line).not.toContain(token);
    expect(line).not.toContain("203.0.113.7");
    expect(line).not.toContain("2001:db8");
    expect(line).not.toContain("luca.ferri");
    expect(line).toContain("/q/[token]/pdf");
    expect(line).toContain("[email]");
    expect(line).toContain("[ip]");
    expect(line).toContain("[segreto]");
  });

  it("lascia leggibili orari, numeri di preventivo e id interni", () => {
    const id = "3fb4ae28-f603-4d82-a0e8-80b3e8f11d3a";
    expect(redact(`alle 12:30:45 preventivo 2026/001 id ${id}`)).toBe(`alle 12:30:45 preventivo 2026/001 id ${id}`);
  });

  it("safeLog ripulisce anche i dettagli annidati e gli errori", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const token = generateLinkToken();
    safeLog("error", `firma fallita su /q/${token}`, { email: "a@b.it", nested: { ip: "10.0.0.1" }, error: new Error(`token ${token}`) });
    const printed = JSON.stringify(spy.mock.calls);
    expect(printed).not.toContain(token);
    expect(printed).not.toContain("a@b.it");
    expect(printed).not.toContain("10.0.0.1");
  });

  it("IP del client, tipo di dispositivo e user agent limitato", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.4", "x-forwarded-for": "1.1.1.1" }))).toBe("198.51.100.4");
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.9, 10.0.0.1" }))).toBe("198.51.100.9");
    expect(clientIp(new Headers())).toBe("unknown");
    expect(deviceClass("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile")).toBe("telefono");
    expect(deviceClass("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)")).toBe("tablet");
    expect(deviceClass("Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)")).toBe("computer");
    expect(storedUserAgent("x".repeat(2000))).toHaveLength(512);
  });
});
