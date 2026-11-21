import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import { oauthErrorMessage } from "@/domain/oauth-errors";
import { authUiConfig, googleConfig, turnstileConfig } from "@/server/auth-providers";
import { createAuth } from "@/server/create-auth";
import { MemoryEmailDriver } from "@/server/email/memory";
import { passesCaptcha, verifyTurnstileToken } from "@/server/turnstile";
import { createTestDb } from "./helpers/db";

const secret = "test-secret-must-be-at-least-32-characters";
const base = "http://127.0.0.1:3000";
const TEST_SITE_KEY = "1x00000000000000000000AA";
const TEST_SECRET = "1x0000000000000000000000000000000AA";

async function makeAuth(extra: Partial<Parameters<typeof createAuth>[0]> = {}) {
  const db = await createTestDb();
  return createAuth({ db, email: new MemoryEmailDriver(), secret, baseURL: base, rateLimit: false, ...extra });
}

function signUpRequest(captchaToken?: string) {
  const headers: Record<string, string> = { "content-type": "application/json", origin: base };
  if (captchaToken) headers["x-captcha-response"] = captchaToken;
  return new Request(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Giulia Neri", email: `g${Math.random().toString(36).slice(2)}@example.com`, password: "Esempio123" }),
  });
}

describe("attivazione condizionale di Google e Turnstile", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("Google si attiva solo con id e secret entrambi presenti e non vuoti", () => {
    expect(googleConfig({})).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_ID: "id" })).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "  " })).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_ID: " id ", GOOGLE_CLIENT_SECRET: "s" })).toEqual({ clientId: "id", clientSecret: "s" });
  });

  it("Turnstile si attiva solo con site key e secret entrambi presenti", () => {
    expect(turnstileConfig({})).toBeNull();
    expect(turnstileConfig({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: TEST_SITE_KEY })).toBeNull();
    expect(turnstileConfig({ TURNSTILE_SECRET_KEY: TEST_SECRET })).toBeNull();
    expect(turnstileConfig({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: TEST_SITE_KEY, TURNSTILE_SECRET_KEY: TEST_SECRET })).toEqual({
      siteKey: TEST_SITE_KEY,
      secretKey: TEST_SECRET,
    });
  });

  it("la configurazione per le pagine non contiene mai i secret", () => {
    const env = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "google-secret", NEXT_PUBLIC_TURNSTILE_SITE_KEY: TEST_SITE_KEY, TURNSTILE_SECRET_KEY: TEST_SECRET };
    const ui = authUiConfig(env);
    expect(ui).toEqual({ google: true, turnstileSiteKey: TEST_SITE_KEY });
    expect(JSON.stringify(ui)).not.toContain("google-secret");
    expect(JSON.stringify(ui)).not.toContain(TEST_SECRET);
    expect(authUiConfig({})).toEqual({ google: false, turnstileSiteKey: null });
  });

  it("senza env Google il provider non si registra, con env sì", async () => {
    const without = await makeAuth();
    expect(without.options.socialProviders).toBeUndefined();
    const withGoogle = await makeAuth({ google: { clientId: "id", clientSecret: "s" } });
    expect(withGoogle.options.socialProviders?.google?.clientId).toBe("id");
  });

  it("collega un account Google esistente solo con email verificate (Google non è un provider fidato)", async () => {
    const auth = await makeAuth({ google: { clientId: "id", clientSecret: "s" } });
    const linking = auth.options.account?.accountLinking as { enabled?: boolean; trustedProviders?: string[]; requireLocalEmailVerified?: boolean; allowDifferentEmails?: boolean } | undefined;
    expect(linking?.enabled).toBe(true);
    expect(linking?.trustedProviders ?? []).not.toContain("google");
    expect(linking?.requireLocalEmailVerified).toBe(true);
    expect(linking?.allowDifferentEmails).toBe(false);
  });

  it("senza secret Turnstile le API HTTP di registrazione funzionano come prima", async () => {
    const auth = await makeAuth();
    const response = await auth.handler(signUpRequest());
    expect(response.status).toBe(200);
  });

  it("con Turnstile attivo le API HTTP rifiutano le richieste senza token", async () => {
    const auth = await makeAuth({ turnstileSecret: TEST_SECRET });
    const response = await auth.handler(signUpRequest());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "MISSING_RESPONSE" });
  });

  it("verifica il token lato server e fallisce chiuso", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ success: true })));
    expect(await verifyTurnstileToken({ secretKey: TEST_SECRET, token: "tok", fetchImpl: ok })).toBe(true);
    const sentBody = (ok.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(sentBody.get("secret")).toBe(TEST_SECRET);
    expect(sentBody.get("response")).toBe("tok");

    const rejected = vi.fn(async () => new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] })));
    expect(await verifyTurnstileToken({ secretKey: TEST_SECRET, token: "tok", fetchImpl: rejected })).toBe(false);

    const down = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await verifyTurnstileToken({ secretKey: TEST_SECRET, token: "tok", fetchImpl: down })).toBe(false);

    const httpError = vi.fn(async () => new Response("no", { status: 500 }));
    expect(await verifyTurnstileToken({ secretKey: TEST_SECRET, token: "tok", fetchImpl: httpError })).toBe(false);

    const unused = vi.fn();
    expect(await verifyTurnstileToken({ secretKey: TEST_SECRET, token: "", fetchImpl: unused })).toBe(false);
    expect(unused).not.toHaveBeenCalled();
  });

  it("una verifica rifiutata lascia nei log i codici Cloudflare, mai token o secret", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rejected = vi.fn(
      async () => new Response(JSON.stringify({ success: false, "error-codes": ["timeout-or-duplicate"], hostname: "quotes.ctrlagency.dev" })),
    );
    expect(await verifyTurnstileToken({ secretKey: TEST_SECRET, token: "tok-segreto", fetchImpl: rejected })).toBe(false);
    expect(warn).toHaveBeenCalledWith("[turnstile] verifica rifiutata", {
      reason: "cloudflare",
      codes: ["timeout-or-duplicate"],
      hostname: "quotes.ctrlagency.dev",
    });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain("tok-segreto");
    expect(logged).not.toContain(TEST_SECRET);
    warn.mockRestore();
  });

  it("le server action passano senza Turnstile e senza token falliscono quando è attivo", async () => {
    const form = new FormData();
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await passesCaptcha(form, undefined)).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", TEST_SITE_KEY);
    vi.stubEnv("TURNSTILE_SECRET_KEY", TEST_SECRET);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await passesCaptcha(form, undefined)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("gli errori OAuth diventano messaggi in italiano", () => {
    expect(oauthErrorMessage(null)).toBeNull();
    expect(oauthErrorMessage("account_not_linked")).toContain("Esiste già un account");
    expect(oauthErrorMessage("account not linked")).toContain("Esiste già un account");
    expect(oauthErrorMessage("access_denied")).toContain("annullato");
    expect(oauthErrorMessage("<script>qualcosa</script>")).toBe("Accesso con Google non riuscito. Riprova o usa email e password.");
  });

  it("la CSP permette solo Cloudflare Turnstile come origine esterna per script e frame", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const csp = rules.flatMap((rule) => rule.headers).find((header) => header.key === "Content-Security-Policy")!.value;
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
    expect(csp).toContain("frame-src https://challenges.cloudflare.com");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
