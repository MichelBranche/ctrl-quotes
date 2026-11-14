import type { SecondaryStorage } from "@better-auth/core/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { schema, user } from "@/db/schema";
import { isPasswordValid } from "@/domain/password";
import type { EmailDriver } from "@/server/email/types";
import { previewAutoVerifyEmail } from "@/server/preview-auth";
import { CAPTCHA_ENDPOINTS } from "@/server/auth-providers";
import { captcha } from "better-auth/plugins";
import { emailOTP } from "better-auth/plugins/email-otp";
import { emailAssetBase, renderVerificationOtpEmail, VERIFICATION_OTP_MINUTES } from "@/server/email/verification-otp";

type AuthDatabase = LibSQLDatabase<typeof schema>;
type AuthPlugins = NonNullable<Parameters<typeof betterAuth>[0]["plugins"]>;
type AuthBaseURL = NonNullable<Parameters<typeof betterAuth>[0]["baseURL"]>;

export type CreateAuthOptions = {
  db: AuthDatabase;
  email: EmailDriver;
  secret: string;
  baseURL?: AuthBaseURL;
  rateLimit?: boolean;
  google?: { clientId: string; clientSecret: string };
  /** Turnstile secret: when set, the public auth HTTP endpoints require a valid captcha token. */
  turnstileSecret?: string;
  plugins?: AuthPlugins;
  secondaryStorage?: SecondaryStorage;
};

function resolveBaseURL(configured: AuthBaseURL | undefined): AuthBaseURL | undefined {
  if (typeof configured === "string" && configured.length > 0) return configured;
  if (configured && typeof configured !== "string") return configured;
  if (process.env.VERCEL_ENV !== "preview") return undefined;
  return { allowedHosts: ["*.vercel.app"], protocol: "https" };
}

function cookieSecure(baseURL: AuthBaseURL | undefined): boolean {
  if (process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview") return true;
  if (typeof baseURL === "string") return baseURL.startsWith("https:");
  return baseURL?.protocol === "https";
}

function emailHtml(intro: string, url: string): string {
  const safe = url.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return `<p>${intro}</p><p><a href="${safe}">${safe}</a></p>`;
}

export function createAuth(options: CreateAuthOptions) {
  const baseURL = resolveBaseURL(options.baseURL);
  const previewVerify = previewAutoVerifyEmail();
  const secure = cookieSecure(baseURL);
  return betterAuth({
    appName: "CTRL Quotes",
    secret: options.secret,
    baseURL,
    trustedOrigins: ["https://quotes.ctrlagency.dev", "https://*.vercel.app"],
    database: drizzleAdapter(options.db, {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: !previewVerify,
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
      sendOnSignUp: false,
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
    account: {
      accountLinking: {
        // Google is NOT a trusted provider on purpose: an existing password account is linked
        // only when Google says the email is verified, and (default) the local email is verified too.
        enabled: true,
        requireLocalEmailVerified: true,
        allowDifferentEmails: false,
      },
    },
    onAPIError: {
      errorURL: "/login",
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
    databaseHooks: previewVerify
      ? {
          user: {
            create: {
              before: async (created) => {
                console.info("[auth:preview] conferma email automatica in fase di registrazione");
                return { data: { ...created, emailVerified: true } };
              },
            },
          },
        }
      : undefined,
    advanced: {
      useSecureCookies: secure,
      trustedProxyHeaders: typeof baseURL === "object",
      defaultCookieAttributes: {
        sameSite: "lax",
        httpOnly: true,
        secure,
      },
    },
    plugins: [
      ...(options.turnstileSecret
        ? [captcha({ provider: "cloudflare-turnstile", secretKey: options.turnstileSecret, endpoints: [...CAPTCHA_ENDPOINTS] })]
        : []),
      emailOTP({
        otpLength: 6,
        expiresIn: VERIFICATION_OTP_MINUTES * 60,
        allowedAttempts: 5,
        storeOTP: "hashed",
        sendVerificationOnSignUp: !previewVerify,
        overrideDefaultEmailVerification: false,
        rateLimit: { window: 60, max: 3 },
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== "email-verification") return;
          if (previewAutoVerifyEmail()) return;
          const rendered = renderVerificationOtpEmail({ otp, assetBase: emailAssetBase() });
          await options.email.send({
            to: email,
            subject: rendered.subject,
            text: rendered.text,
            html: rendered.html,
          });
        },
      }),
      ...(options.plugins ?? []),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const body = ctx.body as { email?: unknown; password?: unknown; newPassword?: unknown } | undefined;
        if (previewVerify && ctx.path === "/sign-in/email" && typeof body?.email === "string") {
          await options.db
            .update(user)
            .set({ emailVerified: true, updatedAt: new Date() })
            .where(eq(user.email, body.email.toLowerCase()));
        }
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
