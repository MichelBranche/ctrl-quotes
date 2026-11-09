import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import fs from "node:fs";
import path from "node:path";
import { schema } from "@/db/schema";

export type AppDatabase = LibSQLDatabase<typeof schema>;

function databaseUrl(): string {
  return process.env.DATABASE_URL ?? "file:./data/local.db";
}

function ensureFileParent(url: string): void {
  if (!url.startsWith("file:") || url.includes(":memory:")) return;
  fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
}

export function createDatabase(url = databaseUrl()): { client: Client; db: AppDatabase } {
  ensureFileParent(url);
  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const db = drizzle(client, { schema });
  return { client, db };
}

let singleton: { client: Client; db: AppDatabase } | undefined;
let migrated: Promise<void> | undefined;

export function getDb(): AppDatabase {
  singleton ??= createDatabase();
  return singleton.db;
}

export async function ensureMigrated(): Promise<void> {
  migrated ??= migrate(getDb(), {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  await migrated;
}
