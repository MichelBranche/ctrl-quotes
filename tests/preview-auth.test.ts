import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { user } from "@/db/schema";
import { createAuth } from "@/server/create-auth";
import { MemoryEmailDriver } from "@/server/email/memory";
import { previewAutoVerifyEmail } from "@/server/preview-auth";
import { createTestDb } from "./helpers/db";

const secret = "test-secret-must-be-at-least-32-characters";
const envKeys = ["VERCEL_ENV", "PREVIEW_AUTO_VERIFY_EMAIL"] as const;
const saved = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

function restoreEnv(): void {
  for (const key of envKeys) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(restoreEnv);

describe("conferma email in anteprima", () => {
  it("resta spenta in produzione anche con il flag", () => {
    process.env.VERCEL_ENV = "production";
    process.env.PREVIEW_AUTO_VERIFY_EMAIL = "1";
    expect(previewAutoVerifyEmail()).toBe(false);
  });

  it("è accesa in preview e con il flag esplicito fuori dalla produzione", () => {
    delete process.env.PREVIEW_AUTO_VERIFY_EMAIL;
    process.env.VERCEL_ENV = "preview";
    expect(previewAutoVerifyEmail()).toBe(true);
    delete process.env.VERCEL_ENV;
    process.env.PREVIEW_AUTO_VERIFY_EMAIL = "1";
    expect(previewAutoVerifyEmail()).toBe(true);
  });

  it("conferma i nuovi account e sblocca quelli già registrati", async () => {
    delete process.env.VERCEL_ENV;
    delete process.env.PREVIEW_AUTO_VERIFY_EMAIL;
    const db = await createTestDb();
    const email = new MemoryEmailDriver();
    const strict = createAuth({
      db,
      email,
      secret,
      baseURL: "http://127.0.0.1:3000",
      rateLimit: false,
    });
    await strict.api.signUpEmail({
      body: { name: "Vecchio Account", email: "vecchio@example.com", password: "Esempio123" },
    });
    const before = await db.select().from(user).where(eq(user.email, "vecchio@example.com"));
    expect(before[0]?.emailVerified).toBe(false);

    process.env.VERCEL_ENV = "preview";
    const preview = createAuth({
      db,
      email,
      secret,
      baseURL: "http://127.0.0.1:3000",
      rateLimit: false,
    });
    const signedUp = await preview.api.signUpEmail({
      body: { name: "Nuovo Account", email: "nuovo@example.com", password: "Esempio123" },
    });
    expect(signedUp.user.emailVerified).toBe(true);

    const signedIn = await preview.api.signInEmail({
      body: { email: "vecchio@example.com", password: "Esempio123" },
    });
    expect(signedIn.user.email).toBe("vecchio@example.com");
    const updated = await db.select().from(user).where(eq(user.email, "vecchio@example.com"));
    expect(updated[0]?.emailVerified).toBe(true);

    process.env.VERCEL_ENV = "production";
    process.env.PREVIEW_AUTO_VERIFY_EMAIL = "1";
    const production = createAuth({
      db,
      email,
      secret,
      baseURL: "http://127.0.0.1:3000",
      rateLimit: false,
    });
    const blocked = await production.api.signUpEmail({
      body: { name: "Produzione", email: "prod@example.com", password: "Esempio123" },
    });
    expect(blocked.user.emailVerified).toBe(false);
  });
});
