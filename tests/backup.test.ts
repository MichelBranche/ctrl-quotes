import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { BACKUP_KEEP, backupPathname, backupsToDelete, dumpSqlite } from "@/server/backup";

describe("backup del database", () => {
  it("esporta schema, trigger e righe, e si puo ricaricare", async () => {
    const source = createClient({ url: ":memory:" });
    await source.execute("create table items (id text primary key, name text not null, blob_data blob)");
    await source.execute("create trigger items_no_update before update on items begin select raise(abort, 'immutabile'); end");
    await source.execute("insert into items (id, name, blob_data) values ('a', 'ciao', X'deadbeef')");
    const dump = await dumpSqlite(source);
    expect(dump.tableCounts.items).toBe(1);
    expect(dump.sql).toContain("CREATE TABLE items");
    expect(dump.sql).toContain("items_no_update");
    expect(dump.sql).toContain("X'deadbeef'");
    expect(dump.sql).not.toContain("\u2014");

    const dest = createClient({ url: ":memory:" });
    await dest.executeMultiple(dump.sql);
    const rows = await dest.execute("select id, name, blob_data from items");
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]!.name).toBe("ciao");
    const blob = rows.rows[0]!.blob_data as ArrayBuffer | Uint8Array;
    expect(Buffer.from(blob as ArrayBuffer).toString("hex")).toBe("deadbeef");
    await expect(dest.execute("update items set name = 'no'")).rejects.toThrow();
  });

  it("mantiene solo gli ultimi 14 backup, i piu recenti", () => {
    const items = Array.from({ length: 16 }, (_, index) => ({
      pathname: `backups/ctrl-quotes-prod/${String(index).padStart(2, "0")}.sql`,
      uploadedAt: new Date(Date.UTC(2026, 10, 1 + index)).toISOString(),
    }));
    const deleted = backupsToDelete(items, BACKUP_KEEP);
    expect(deleted).toEqual(["backups/ctrl-quotes-prod/01.sql", "backups/ctrl-quotes-prod/00.sql"]);
    expect(backupPathname(new Date("2026-11-14T02:00:00.000Z"))).toBe("backups/ctrl-quotes-prod/2026-11-14T02-00-00-000Z.sql");
  });
});
