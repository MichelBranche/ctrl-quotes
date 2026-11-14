import "server-only";
import type { Client } from "@libsql/client";
import { del, list, put } from "@vercel/blob";

export const BACKUP_PREFIX = "backups/ctrl-quotes-prod/";
export const BACKUP_KEEP = 14;

export type TableCounts = Record<string, number>;

export type SqliteDump = {
  sql: string;
  bytes: number;
  tableCounts: TableCounts;
  tableCount: number;
  rowCount: number;
};

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Date) return String(value.getTime());
  if (value instanceof ArrayBuffer) return `X'${Buffer.from(value).toString("hex")}'`;
  if (ArrayBuffer.isView(value)) return `X'${Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("hex")}'`;
  if (Buffer.isBuffer(value)) return `X'${value.toString("hex")}'`;
  if (typeof value === "object" && value && (value as { type?: string }).type === "Buffer" && Array.isArray((value as { data?: unknown }).data)) {
    return `X'${Buffer.from((value as { data: number[] }).data).toString("hex")}'`;
  }
  if (typeof value === "object") return sqlLiteral(JSON.stringify(value));
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Full SQL dump of schema, indexes, triggers and rows. Safe to replay on an empty SQLite/libSQL database. */
export async function dumpSqlite(client: Pick<Client, "execute">): Promise<SqliteDump> {
  const master = await client.execute(
    "select type, name, sql from sqlite_master where name not like 'sqlite_%' order by case type when 'table' then 0 when 'index' then 1 when 'trigger' then 2 else 3 end, name",
  );
  const objects = master.rows;
  const tables = objects.filter((row) => row.type === "table").map((row) => String(row.name));
  const lines: string[] = [
    "-- CTRL Quotes backup",
    `-- created: ${new Date().toISOString()}`,
    "PRAGMA foreign_keys=OFF;",
    "BEGIN TRANSACTION;",
  ];
  for (const obj of objects) {
    if (!obj.sql) continue;
    lines.push(`DROP ${String(obj.type).toUpperCase()} IF EXISTS ${quoteIdent(String(obj.name))};`);
    lines.push(`${String(obj.sql)};`);
  }
  const tableCounts: TableCounts = {};
  let rowCount = 0;
  for (const table of tables) {
    const ident = quoteIdent(table);
    const info = await client.execute(`pragma table_info(${ident})`);
    const cols = info.rows.map((row) => String(row.name));
    const colList = cols.map(quoteIdent).join(", ");
    const rows = await client.execute(`select * from ${ident}`);
    tableCounts[table] = rows.rows.length;
    rowCount += rows.rows.length;
    for (const row of rows.rows) {
      const values = cols.map((col) => sqlLiteral(row[col])).join(",");
      lines.push(`INSERT INTO ${ident} (${colList}) VALUES (${values});`);
    }
  }
  lines.push("COMMIT;", "PRAGMA foreign_keys=ON;");
  const sql = `${lines.join("\n")}\n`;
  return { sql, bytes: Buffer.byteLength(sql), tableCounts, tableCount: tables.length, rowCount };
}

export type BackupItem = { pathname: string; uploadedAt: string | Date };

/** Pathnames to delete so at most `keep` backups remain, newest first. */
export function backupsToDelete(items: BackupItem[], keep = BACKUP_KEEP): string[] {
  const sorted = [...items].sort((a, b) => {
    const left = new Date(a.uploadedAt).getTime();
    const right = new Date(b.uploadedAt).getTime();
    return right - left;
  });
  return sorted.slice(keep).map((item) => item.pathname);
}

export function backupPathname(now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `${BACKUP_PREFIX}${stamp}.sql`;
}

export async function uploadAndPruneBackup(sql: string, now = new Date()): Promise<{ pathname: string; bytes: number; url: string; deleted: string[] }> {
  const pathname = backupPathname(now);
  const uploaded = await put(pathname, sql, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/sql; charset=utf-8",
  });
  const listed = await list({ prefix: BACKUP_PREFIX });
  const deleted = backupsToDelete(
    listed.blobs.map((blob) => ({ pathname: blob.pathname, uploadedAt: blob.uploadedAt })),
    BACKUP_KEEP,
  );
  if (deleted.length > 0) await del(deleted);
  return { pathname: uploaded.pathname, bytes: Buffer.byteLength(sql), url: uploaded.url, deleted };
}
