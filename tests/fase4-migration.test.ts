import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createDatabase } from "@/db/client";

const source = path.join(process.cwd(), "drizzle");
const sql0004 = fs.readFileSync(path.join(source, "0004_fase4_fondamenta.sql"), "utf8");

/** Migrations folder stopped before 0004, to build a database as it is in production today. */
function foldersUpTo(count: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-mig-"));
  fs.cpSync(source, dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { entries: unknown[] };
  journal.entries = journal.entries.slice(0, count);
  fs.writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

describe("migrazione 0004, solo aggiunte", () => {
  it("non elimina tabelle né righe e non riscrive colonne", () => {
    const statements = sql0004.split("--> statement-breakpoint").map((item) => item.replace(/^--.*$/gm, "").trim()).filter(Boolean);
    for (const statement of statements) {
      expect(statement).toMatch(/^(CREATE TABLE|CREATE INDEX|CREATE UNIQUE INDEX|ALTER TABLE `\w+` ADD|DROP INDEX `quote_acceptances_quote_uq`)/);
    }
    expect(sql0004).not.toMatch(/DROP TABLE|DELETE FROM|UPDATE `|RENAME|__new_/);
    for (const statement of statements.filter((item) => item.startsWith("ALTER TABLE"))) {
      // A NOT NULL column added to an existing table needs a default, or old rows would break.
      if (statement.includes("NOT NULL")) expect(statement).toMatch(/DEFAULT/);
    }
  });

  it("sui dati esistenti: tutto resta com'era, le colonne nuove hanno i default", async () => {
    const { client, db } = createDatabase(":memory:");
    await migrate(db, { migrationsFolder: foldersUpTo(4) });
    const t = 1794500000000;
    await client.executeMultiple(`
      INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'Giulia', 'g@example.com', 1, ${t}, ${t});
      INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES ('w1', 'Studio', 'studio', ${t}, ${t});
      INSERT INTO quotes (id, workspace_id, title, status, created_at, updated_at, total_cents) VALUES ('q1', 'w1', 'Sito', 'pending', ${t}, ${t}, 329400);
      INSERT INTO quote_versions (id, workspace_id, quote_id, version_no, snapshot_json, snapshot_sha256, renderer_version, totals_json, created_at) VALUES ('v1', 'w1', 'q1', 1, '{}', 'abc', 'r', '{}', ${t});
      INSERT INTO quote_public_links (id, workspace_id, quote_id, token_hash, created_at) VALUES ('l1', 'w1', 'q1', 'hash1', ${t});
      INSERT INTO quote_acceptances (id, workspace_id, quote_id, decision, version_id, signer_name, signer_email, options_json, totals_sha256, terms_sha256, consent_text, idempotency_key, created_at) VALUES ('a1', 'w1', 'q1', 'rejected', 'v1', 'Luca', 'l@example.com', '[]', 't', 't', 'ok', 'k1', ${t});
      INSERT INTO email_deliveries (id, to_address, subject, status, created_at, updated_at) VALUES ('e1', 'l@example.com', 'Ciao', 'sent', ${t}, ${t});
    `);
    const before = await client.execute("select * from quotes");

    await migrate(db, { migrationsFolder: source });
    await migrate(db, { migrationsFolder: source });

    const quote = (await client.execute("select * from quotes where id = 'q1'")).rows[0]!;
    for (const column of Object.keys(before.rows[0]!)) expect(quote[column]).toEqual(before.rows[0]![column]);
    expect(quote.sent_version_id).toBeNull();
    expect(quote.view_count).toBe(0);
    const link = (await client.execute("select * from quote_public_links where id = 'l1'")).rows[0]!;
    expect(link.token_hash).toBe("hash1");
    expect(link.token_enc).toBeNull();
    expect(link.view_count).toBe(0);
    expect((await client.execute("select count(*) as n from quote_acceptances")).rows[0]!.n).toBe(1);
    expect((await client.execute("select count(*) as n from email_deliveries")).rows[0]!.n).toBe(1);
    expect((await client.execute("select count(*) as n from quote_versions")).rows[0]!.n).toBe(1);

    const tables = (await client.execute("select name from sqlite_master where type = 'table'")).rows.map((row) => row.name);
    expect(tables).toEqual(expect.arrayContaining(["notifications", "notification_prefs", "rate_limits"]));
  });

  it("una decisione per versione: dopo un rifiuto si può decidere sulla versione nuova, mai due volte sulla stessa", async () => {
    const { client, db } = createDatabase(":memory:");
    await migrate(db, { migrationsFolder: source });
    const t = 1794500000000;
    const insert = (id: string, version: string, key: string) =>
      client.execute(`INSERT INTO quote_acceptances (id, workspace_id, quote_id, decision, version_id, signer_name, signer_email, options_json, totals_sha256, terms_sha256, consent_text, idempotency_key, created_at) VALUES ('${id}', 'w1', 'q1', 'accepted', '${version}', 'Luca', 'l@example.com', '[]', 't', 't', 'ok', '${key}', ${t})`);
    await insert("a1", "v1", "k1");
    await insert("a2", "v2", "k2");
    await expect(insert("a3", "v2", "k3")).rejects.toThrow(/UNIQUE/);
    await expect(insert("a4", "v3", "k2")).rejects.toThrow(/UNIQUE/);
  });

  it("le preferenze accettano solo i valori previsti, con 'prima apertura' come default", async () => {
    const { client, db } = createDatabase(":memory:");
    await migrate(db, { migrationsFolder: source });
    const t = 1794500000000;
    await client.executeMultiple(`
      INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'Giulia', 'g@example.com', 1, ${t}, ${t});
      INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES ('w1', 'Studio', 'studio', ${t}, ${t});
      INSERT INTO notification_prefs (user_id, workspace_id, updated_at) VALUES ('u1', 'w1', ${t});
    `);
    const row = (await client.execute("select * from notification_prefs")).rows[0]!;
    expect(row.email_on_view).toBe("first");
    expect(row.email_on_decision).toBe(1);
    await expect(client.execute("update notification_prefs set email_on_view = 'sempre'")).rejects.toThrow(/CHECK/);
  });
});
