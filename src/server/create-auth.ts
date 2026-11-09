import type { SecondaryStorage } from "@better-auth/core/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { schema } from "@/db/schema";
import { isPasswordValid } from "@/domain/password";
import type { EmailDriver } from "@/server/email/types";

type AuthDatabase = LibSQLDatabase<typeof schema>;
type AuthPlugins = NonNullable<Parameters<typeof betterAuth>[0]["plugins"]>;

export type CreateAuthOptions = {
  db: AuthDatabase;
  email: EmailDriver;
  secret: string;
  baseURL?: string;
  rateLimit?: boolean;
  google?: { clientId: string; clientSecret: string };
  plugins?: AuthPlugins;
  secondaryStorage?: SecondaryStorage;
};

function cookieSecure(baseURL: string | undefined): boolean {
  return (baseURL ?? "").startsWith("https:");
}

function emailHtml(intro: string, url: string): string {
  const safe = url.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return `<p>${intro}</p><p><a href="${safe}">${safe}</a></p>`;
}

export function createAuth(options: CreateAuthOptions) {
  const secure = cookieSecure(options.baseURL);
  return betterAuth({
    appName: "CTRL Quotes",
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: ["https://*.vercel.app"],
    database: drizzleAdapter(options.db, {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await options.email.send({
          to: user.email,
          subject: "Reimposta la password di CTRL Quotes",
          text: `Apri questo link per scegliere una nuova password: ${url}`,
          html: emailHtml("Apri questo link per scegliere una nuova password.", url),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => {
        await options.email.send({
          to: user.email,
          subject: "Conferma l'email di CTRL Quotes",
          text: `Apri questo link per confermare l'email: ${url}`,
          html: emailHtml("Apri questo link per confermare l'email.", url),
        });
      },
    },
    socialProviders: options.google
      ? {
          google: {
            clientId: options.google.clientId,
            clientSecret: options.google.clientSecret,
          },
        }
      : undefined,
    secondaryStorage: options.secondaryStorage,
    rateLimit: {
      enabled: options.rateLimit ?? true,
      window: 60,
      max: 100,
      storage: options.secondaryStorage ? "secondary-storage" : "memory",
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
      },
    },
    session: {
      cookieCache: {
        enabled: false,
      },
    },
    advanced: {
      useSecureCookies: secure,
      defaultCookieAttributes: {
        sameSite: "lax",
        httpOnly: true,
        secure,
      },
    },
    plugins: options.plugins ?? [],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const body = ctx.body as { password?: unknown; newPassword?: unknown } | undefined;
        const candidate =
          ctx.path === "/sign-up/email"
            ? body?.password
            : ctx.path === "/reset-password"
              ? body?.newPassword
              : undefined;
        if (typeof candidate === "string" && !isPasswordValid(candidate)) {
          throw new APIError("BAD_REQUEST", {
            message: "La password deve avere almeno 8 caratteri, una lettera e un numero.",
          });
        }
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
