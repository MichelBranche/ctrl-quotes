import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, ensureMigrated, isBuildPhase } from "@/db/client";

const migrationsFolder = path.join(process.cwd(), "drizzle");

function restore(name: "NEXT_PHASE" | "NEXT_IS_EXPORT_WORKER" | "DATABASE_URL", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("migrazioni", () => {
  const phase = process.env.NEXT_PHASE;
  const worker = process.env.NEXT_IS_EXPORT_WORKER;
  const url = process.env.DATABASE_URL;

  afterEach(() => {
    restore("NEXT_PHASE", phase);
    restore("NEXT_IS_EXPORT_WORKER", worker);
    restore("DATABASE_URL", url);
  });

  it("non apre il database durante il prerender di next build", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    process.env.DATABASE_URL = "libsql://build-must-not-connect.invalid";
    expect(isBuildPhase()).toBe(true);
    await expect(ensureMigrated()).resolves.toBeUndefined();
  });

  it("non apre il database nel worker di export", async () => {
    delete process.env.NEXT_PHASE;
    process.env.NEXT_IS_EXPORT_WORKER = "true";
    process.env.DATABASE_URL = "libsql://build-must-not-connect.invalid";
    expect(isBuildPhase()).toBe(true);
    await expect(ensureMigrated()).resolves.toBeUndefined();
  });

  it("applica 0000_init due volte senza errore", async () => {
    delete process.env.NEXT_PHASE;
    delete process.env.NEXT_IS_EXPORT_WORKER;
    const { db } = createDatabase(":memory:");
    await migrate(db, { migrationsFolder });
    await migrate(db, { migrationsFolder });
  });
});
