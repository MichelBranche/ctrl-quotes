import { describe, expect, it } from "vitest";
import { legacyQuoteRedirect, normalizeBaseUrl, parseLegacyHosts, publicQuoteUrl, resolvePublicBaseUrl } from "@/domain/public-url";

const token = "Xk3mP9vQ2rA8bC1dE4fG7hJ0kL2mN5pQ8rS1tU4f7Lw";

describe("indirizzo base dei link pubblici", () => {
  it("una sola impostazione decide il dominio, con ripieghi in ordine", () => {
    expect(resolvePublicBaseUrl({ PUBLIC_QUOTE_BASE_URL: "https://preventivi.example.com/", NEXT_PUBLIC_APP_URL: "https://app.example.com" })).toBe("https://preventivi.example.com");
    expect(resolvePublicBaseUrl({ NEXT_PUBLIC_APP_URL: "https://ctrl-quotes.vercel.app" })).toBe("https://ctrl-quotes.vercel.app");
    expect(resolvePublicBaseUrl({ BETTER_AUTH_URL: "https://ctrl-quotes.vercel.app" })).toBe("https://ctrl-quotes.vercel.app");
    expect(resolvePublicBaseUrl({})).toBe("http://localhost:3000");
  });

  it("tiene solo l'origine e ignora valori non validi", () => {
    expect(normalizeBaseUrl("https://Example.com/percorso?x=1")).toBe("https://example.com");
    expect(normalizeBaseUrl("ftp://example.com")).toBeNull();
    expect(normalizeBaseUrl("https://user:pw@example.com")).toBeNull();
    expect(normalizeBaseUrl("non un url")).toBeNull();
    expect(resolvePublicBaseUrl({ PUBLIC_QUOTE_BASE_URL: "sbagliato", NEXT_PUBLIC_APP_URL: "https://ok.example" })).toBe("https://ok.example");
  });

  it("in produzione pretende https e un indirizzo esplicito", () => {
    expect(() => resolvePublicBaseUrl({ VERCEL_ENV: "production", PUBLIC_QUOTE_BASE_URL: "http://ctrl-quotes.vercel.app" })).toThrow(/https/);
    expect(() => resolvePublicBaseUrl({ VERCEL_ENV: "production" })).toThrow(/PUBLIC_QUOTE_BASE_URL/);
  });

  it("costruisce il link con il percorso /q/<token>", () => {
    expect(publicQuoteUrl("https://ctrl-quotes.vercel.app", token)).toBe(`https://ctrl-quotes.vercel.app/q/${token}`);
  });
});

describe("redirect dai vecchi domini", () => {
  const env = { PUBLIC_QUOTE_BASE_URL: "https://preventivi.example.com", PUBLIC_QUOTE_LEGACY_HOSTS: "ctrl-quotes.vercel.app, https://old.example.com/" };

  it("legge l'elenco degli host vecchi", () => {
    expect(parseLegacyHosts(env.PUBLIC_QUOTE_LEGACY_HOSTS)).toEqual(["ctrl-quotes.vercel.app", "old.example.com"]);
    expect(parseLegacyHosts(undefined)).toEqual([]);
  });

  it("un link già inviato sul vecchio dominio va al nuovo con lo stesso token", () => {
    const target = legacyQuoteRedirect(new URL(`https://ctrl-quotes.vercel.app/q/${token}/pdf?download=1`), env);
    expect(target?.toString()).toBe(`https://preventivi.example.com/q/${token}/pdf?download=1`);
  });

  it("non tocca l'app, il dominio nuovo e gli host non elencati", () => {
    expect(legacyQuoteRedirect(new URL("https://ctrl-quotes.vercel.app/app/quotes"), env)).toBeNull();
    expect(legacyQuoteRedirect(new URL(`https://preventivi.example.com/q/${token}`), env)).toBeNull();
    expect(legacyQuoteRedirect(new URL(`https://altro.example.com/q/${token}`), env)).toBeNull();
    expect(legacyQuoteRedirect(new URL(`https://ctrl-quotes.vercel.app/q/${token}`), { PUBLIC_QUOTE_LEGACY_HOSTS: "ctrl-quotes.vercel.app" })).toBeNull();
  });

  it("niente giri a vuoto se il vecchio host è anche quello nuovo", () => {
    expect(legacyQuoteRedirect(new URL(`https://ctrl-quotes.vercel.app/q/${token}`), { PUBLIC_QUOTE_BASE_URL: "https://ctrl-quotes.vercel.app", PUBLIC_QUOTE_LEGACY_HOSTS: "ctrl-quotes.vercel.app" })).toBeNull();
  });
});
