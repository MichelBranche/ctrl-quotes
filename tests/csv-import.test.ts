import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "@/db/client";
import { buildImportPreview, guessMapping, parseCsv } from "@/domain/csv";
import { createClient, listClients } from "@/server/clients";
import { commitClientImport, previewClientImport } from "@/server/client-import";
import { createTestDb } from "./helpers/db";
import { joinAs, ownerWithWorkspace } from "./helpers/actors";

function must<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

const csv = [
  "\uFEFFRagione sociale;Email;P.IVA;Tipo;Stato;Indirizzo",
  'Studio Forma;info@forma.example;IT12345678901;azienda;attivo;"Via Tortona 12; Milano"',
  "Mario Rossi;mario@example.com;;privato;prospect;",
  "Doppione;INFO@forma.example;;azienda;;",
  "X;x@example.com;;azienda;;",
  "Senza mail;;;boh;;",
  "Già presente;esistente@example.com;;azienda;;",
].join("\r\n");

describe("parser CSV", () => {
  it("gestisce BOM, punto e virgola, virgolette e intestazioni italiane", () => {
    const parsed = parseCsv(csv);
    expect(parsed.delimiter).toBe(";");
    expect(parsed.headers[0]).toBe("Ragione sociale");
    expect(parsed.rows[0]?.[5]).toBe("Via Tortona 12; Milano");
    const mapping = guessMapping(parsed.headers);
    expect(mapping).toMatchObject({ name: 0, email: 1, vatNumber: 2, kind: 3, status: 4, address: 5, phone: -1 });
  });

  it("legge virgole e virgolette doppie escapate", () => {
    const parsed = parseCsv('nome,email\n"Rossi, Bianchi & ""Co""",a@b.it\n');
    expect(parsed.delimiter).toBe(",");
    expect(parsed.rows).toEqual([['Rossi, Bianchi & "Co"', "a@b.it"]]);
  });

  it("segna errori e doppioni con il numero di riga", () => {
    const parsed = parseCsv(csv);
    const preview = buildImportPreview(parsed, guessMapping(parsed.headers), [
      { name: "Già presente", email: "esistente@example.com", vatNumber: null },
    ]);
    expect(preview.valid).toBe(2);
    expect(preview.duplicates).toBe(2);
    expect(preview.errors).toBe(2);
    const byLine = Object.fromEntries(preview.rows.map((row) => [row.line, row]));
    expect(byLine[4]).toMatchObject({ status: "duplicate", reason: "Ripete la riga 2 del file." });
    expect(byLine[5]).toMatchObject({ status: "error" });
    expect(byLine[6]).toMatchObject({ status: "error" });
    expect(byLine[7]).toMatchObject({ status: "duplicate", reason: "Già presente in rubrica." });
  });
});

describe("import clienti", () => {
  let db: AppDatabase;
  let alpha: { userId: string; workspaceId: string };
  let beta: { userId: string; workspaceId: string };

  beforeEach(async () => {
    db = await createTestDb();
    alpha = await ownerWithWorkspace(db, "alpha@example.com", "Studio Alfa");
    beta = await ownerWithWorkspace(db, "beta@example.com", "Studio Beta");
  });

  it("mostra l'anteprima e importa solo le righe valide, deduplicando nel workspace", async () => {
    must(await createClient(db, alpha, { kind: "azienda", name: "Già presente", email: "esistente@example.com" }));
    must(await createClient(db, beta, { kind: "azienda", name: "Studio Forma", email: "info@forma.example" }));
    const preview = must(await previewClientImport(db, alpha, csv, null));
    expect(preview.headers).toHaveLength(6);
    expect(preview.valid).toBe(2);
    const result = must(await commitClientImport(db, alpha, csv, preview.mapping));
    expect(result).toEqual({ imported: 2, duplicates: 2, errors: 2 });
    const list = must(await listClients(db, alpha, { filter: "all" }));
    expect(list.items.map((item) => item.name).sort()).toEqual(["Già presente", "Mario Rossi", "Studio Forma"]);
    const again = must(await previewClientImport(db, alpha, csv, preview.mapping));
    expect(again.valid).toBe(0);
    expect((await commitClientImport(db, alpha, csv, preview.mapping)).ok).toBe(false);
    expect(must(await listClients(db, beta)).total).toBe(1);
  });

  it("rifiuta mapping non validi, file vuoti e utenti senza permesso", async () => {
    expect((await previewClientImport(db, alpha, "", null)).ok).toBe(false);
    expect((await previewClientImport(db, alpha, "nome\n", null)).ok).toBe(false);
    expect((await previewClientImport(db, alpha, csv, { name: 0, email: 0 })).ok).toBe(false);
    expect((await previewClientImport(db, alpha, csv, { name: 99 })).ok).toBe(false);
    const member = await joinAs(db, alpha.workspaceId, "membro@example.com", "member");
    const denied = await commitClientImport(db, member, csv, null);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error).toBe("forbidden");
    expect((await commitClientImport(db, { ...alpha, workspaceId: beta.workspaceId }, csv, null)).ok).toBe(false);
    const rows = ["nome", ...Array.from({ length: 1001 }, (_, index) => `Cliente ${index}`)].join("\n");
    expect((await previewClientImport(db, alpha, rows, null)).ok).toBe(false);
  });
});
