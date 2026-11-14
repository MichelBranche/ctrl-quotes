import "server-only";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/db/client";
import { getEmailDriver } from "@/server/email";
import { googleConfig, turnstileConfig } from "@/server/auth-providers";
import { createAuth, type Auth } from "@/server/create-auth";
import { resolveAuthSecret } from "@/server/secret";
import { createUpstashStorage } from "@/server/upstash";

let authSingleton: Auth | undefined;

export function getAuth(): Auth {
  if (!authSingleton) {
    authSingleton = createAuth({
      db: getDb(),
      email: getEmailDriver(),
      secret: resolveAuthSecret(),
      baseURL: process.env.BETTER_AUTH_URL,
      google: googleConfig() ?? undefined,
      turnstileSecret: turnstileConfig()?.secretKey,
      secondaryStorage: createUpstashStorage(),
      plugins: [nextCookies()],
    });
  }
  return authSingleton;
}

export const auth = new Proxy({} as Auth, {
  get(_target, property, receiver) {
    const instance = getAuth();
    const value = Reflect.get(instance, property, receiver) as unknown;
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(instance) : value;
  },
});
