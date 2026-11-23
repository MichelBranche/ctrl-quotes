import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { APIError } from "better-auth/api";
import { user } from "@/db/schema";
import { createAuth } from "@/server/create-auth";
import { MemoryEmailDriver } from "@/server/email/memory";
import { createTestDb } from "./helpers/db";

const secret = "test-secret-must-be-at-least-32-characters";

function tokenFrom(text: string): string {
  const match = text.match(/https?:\/\/\S+/);
  if (!match?.[0]) throw new Error(`Link assente in ${text}`);
  const url = new URL(match[0]);
  const queryToken = url.searchParams.get("token");
  if (queryToken) return queryToken;
  const pathToken = url.pathname.split("/").filter(Boolean).at(-1);
  if (pathToken && pathToken !== "verify-email" && pathToken !== "reset-password") return pathToken;
  throw new Error(`Token assente in ${text}`);
}

function otpFrom(text: string): string {
  const match = text.match(/Codice:\s*(\d{6})/) ?? text.match(/\b(\d{6})\b/);
  if (!match?.[1]) throw new Error(`Codice assente in ${text}`);
  return match[1];
}

describe("auth", () => {
  it("registra, verifica, accede, esce e reimposta la password", async () => {
    const db = await createTestDb();
    const email = new MemoryEmailDriver();
    const auth = createAuth({
      db,
      email,
      secret,
      baseURL: "http://127.0.0.1:3000",
      rateLimit: true,
    });

    const signedUp = await auth.api.signUpEmail({
      body: {
        name: "Giulia Neri",
        email: "giulia.neri@example.com",
        password: "Esempio123",
      },
    });
    expect(signedUp.user.emailVerified).toBe(false);
    expect(email.messages).toHaveLength(1);
    expect(email.messages[0]?.subject).toBe("Conferma la tua email");
    expect(email.messages[0]?.text).toMatch(/Codice:\s*\d{6}/);
    expect(email.messages[0]?.html).toContain("Conferma la tua email");

    await expect(
      auth.api.signInEmail({
        body: { email: "giulia.neri@example.com", password: "Esempio123" },
      }),
    ).rejects.toBeInstanceOf(APIError);

    await auth.api.verifyEmailOTP({
      body: { email: "giulia.neri@example.com", otp: otpFrom(email.messages[0]!.text) },
    });
    const verified = await db.select().from(user).where(eq(user.email, "giulia.neri@example.com"));
    expect(verified[0]?.emailVerified).toBe(true);

    await expect(
      auth.api.signInEmail({
        body: { email: "giulia.neri@example.com", password: "sbagliata1" },
      }),
    ).rejects.toBeInstanceOf(APIError);

    const signedIn = await auth.api.signInEmail({
      body: { email: "giulia.neri@example.com", password: "Esempio123" },
      returnHeaders: true,
    });
    const cookie = signedIn.headers.get("set-cookie");
    expect(cookie).toContain("session_token");
    expect(cookie?.toLowerCase()).toContain("httponly");
    expect(cookie?.toLowerCase()).toContain("samesite=lax");

    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookie ?? "" }),
    });
    expect(session?.user.email).toBe("giulia.neri@example.com");

    await auth.api.signOut({
      headers: new Headers({ cookie: cookie ?? "" }),
    });
    const afterOut = await auth.api.getSession({
      headers: new Headers({ cookie: cookie ?? "" }),
    });
    expect(afterOut).toBeNull();

    await auth.api.requestPasswordReset({
      body: { email: "giulia.neri@example.com", redirectTo: "http://127.0.0.1:3000/reset-password" },
    });
    const resetMail = email.messages.at(-1);
    expect(resetMail?.subject).toContain("password");
    await auth.api.resetPassword({
      body: { newPassword: "NuovaPassword9", token: tokenFrom(resetMail!.text) },
    });
    const again = await auth.api.signInEmail({
      body: { email: "giulia.neri@example.com", password: "NuovaPassword9" },
    });
    expect(again.user.email).toBe("giulia.neri@example.com");
  });

  it("blocca il login dopo troppi tentativi", async () => {
    const db = await createTestDb();
    const auth = createAuth({
      db,
      email: new MemoryEmailDriver(),
      secret,
      baseURL: "http://127.0.0.1:3000",
    });
    await auth.api.signUpEmail({
      body: { name: "Rate Limit", email: "rate@example.com", password: "Esempio123" },
    });
    let limited = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await auth.handler(
        new Request("http://127.0.0.1:3000/api/auth/sign-in/email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://127.0.0.1:3000",
          },
          body: JSON.stringify({ email: "rate@example.com", password: "sbagliata1" }),
        }),
      );
      if (response.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it("rifiuta una password senza numeri", async () => {
    const db = await createTestDb();
    const auth = createAuth({
      db,
      email: new MemoryEmailDriver(),
      secret,
      baseURL: "http://127.0.0.1:3000",
      rateLimit: false,
    });
    await expect(
      auth.api.signUpEmail({
        body: { name: "Debole", email: "debole@example.com", password: "sololettere" },
      }),
    ).rejects.toBeInstanceOf(APIError);
  });
});

describe("auth: email non confermata", () => {
  it("il login con la password giusta dice EMAIL_NOT_VERIFIED, e il reset conferma l'email", async () => {
    const db = await createTestDb();
    const email = new MemoryEmailDriver();
    const auth = createAuth({ db, email, secret, baseURL: "http://127.0.0.1:3000", rateLimit: false });
    await auth.api.signUpEmail({ body: { name: "Luca Bianchi", email: "luca.bianchi@example.com", password: "Iniziale123" } });

    const wrong = await auth.api
      .signInEmail({ body: { email: "luca.bianchi@example.com", password: "Sbagliata123" } })
      .catch((error: unknown) => error);
    expect((wrong as APIError).body?.code).toBe("INVALID_EMAIL_OR_PASSWORD");

    const right = await auth.api
      .signInEmail({ body: { email: "luca.bianchi@example.com", password: "Iniziale123" } })
      .catch((error: unknown) => error);
    expect(right).toBeInstanceOf(APIError);
    expect((right as APIError).body?.code).toBe("EMAIL_NOT_VERIFIED");

    await auth.api.requestPasswordReset({
      body: { email: "luca.bianchi@example.com", redirectTo: "http://127.0.0.1:3000/reset-password" },
    });
    const resetMail = email.messages.at(-1)!;
    await auth.api.resetPassword({ body: { newPassword: "Nuova12345", token: tokenFrom(resetMail.text) } });

    const row = await db.select().from(user).where(eq(user.email, "luca.bianchi@example.com"));
    expect(row[0]?.emailVerified).toBe(true);
    const signedIn = await auth.api.signInEmail({ body: { email: "luca.bianchi@example.com", password: "Nuova12345" } });
    expect(signedIn.user.email).toBe("luca.bianchi@example.com");
  });
});
