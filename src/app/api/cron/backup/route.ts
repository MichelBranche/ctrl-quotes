import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";
import { dumpSqlite, uploadAndPruneBackup } from "@/server/backup";
import { safeLog } from "@/server/redact";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function databaseClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL mancante");
  return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const client = databaseClient();
  try {
    const dump = await dumpSqlite(client);
    const stored = await uploadAndPruneBackup(dump.sql);
    safeLog("info", "[backup] dump salvato", { pathname: stored.pathname, bytes: stored.bytes, tables: dump.tableCount, rows: dump.rowCount, deleted: stored.deleted.length });
    return NextResponse.json({
      ok: true,
      pathname: stored.pathname,
      bytes: stored.bytes,
      tables: dump.tableCount,
      rows: dump.rowCount,
      deleted: stored.deleted.length,
    });
  } catch (error) {
    safeLog("error", "[backup] dump non riuscito", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Backup non riuscito" }, { status: 500 });
  } finally {
    client.close();
  }
}
