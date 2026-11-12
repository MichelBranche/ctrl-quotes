import path from "node:path";
import { createDatabase, type AppDatabase } from "@/db/client";

export async function createTestDb(): Promise<AppDatabase> {
  const { db } = createDatabase(":memory:");
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}
