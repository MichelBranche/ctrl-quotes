import "server-only";
import type { SecondaryStorage } from "@better-auth/core/db";
import { Redis } from "@upstash/redis";

export function createUpstashStorage(): SecondaryStorage | undefined {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return undefined;
  const redis = new Redis({ url, token });
  return {
    get: (key: string) => redis.get(key),
    getAndDelete: async (key: string) => {
      const value = await redis.get(key);
      await redis.del(key);
      return value;
    },
    increment: async (key: string, ttl: number) => {
      const value = await redis.incr(key);
      if (value === 1) await redis.expire(key, ttl);
      return value;
    },
    set: (key: string, value: string, ttl?: number) =>
      ttl ? redis.set(key, value, { ex: ttl }) : redis.set(key, value),
    delete: async (key: string) => {
      await redis.del(key);
    },
  };
}
