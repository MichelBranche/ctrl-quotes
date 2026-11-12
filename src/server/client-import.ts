import type { AppDatabase } from "@/db/client";
import { clients } from "@/db/schema";
import {
  buildImportPreview,
  csvLimits,
  guessMapping,
  mappingFromUnknown,
  parseCsv,
  type ColumnMapping,
  type ImportRow,
} from "@/domain/csv";
import { createId } from "@/domain/ids";
import { authorize, invalid, ok, type Actor, type Result } from "@/server/access";
import { writeAuditLog } from "@/server/audit";
import { clientDedupKeys } from "@/server/clients";

export type PreviewRow = Exclude<ImportRow, { status: "valid" }> | { line: number; status: "valid"; name: string };

export type ImportPreviewResult = {
  headers: string[];
  sample: string[][];
  mapping: ColumnMapping;
  totalRows: number;
  truncated: boolean;
  valid: number;
  duplicates: number;
  errors: number;
  rows: PreviewRow[];
};

function checkText(text: unknown): Result<string> {
  if (typeof text !== "string" || text.trim() === "") return invalid("Il file è vuoto.");
  if (new TextEncoder().encode(text).length > csvLimits.maxBytes) return invalid("Il file supera 1 MB.");
  return ok(text);
}

async function analyse(db: AppDatabase, actor: Actor, text: unknown, rawMapping: unknown) {
  const checked = checkText(text);
  if (!checked.ok) return checked;
  const parsed = parseCsv(checked.value);
  if (parsed.headers.length === 0 || parsed.rows.length === 0) {
    return invalid("Il file non contiene righe. La prima riga deve avere le intestazioni delle colonne.");
  }
  if (parsed.rows.length > csvLimits.maxRows) {
    return invalid(`Il file ha ${parsed.rows.length} righe. Il massimo per importazione è ${csvLimits.maxRows}.`);
  }
  const mapping =
    rawMapping === null || rawMapping === undefined
      ? guessMapping(parsed.headers)
      : mappingFromUnknown(rawMapping, parsed.headers.length);
  if (!mapping) return invalid("La corrispondenza delle colonne non è valida. Ogni colonna può essere usata una volta.");
  const existing = await clientDedupKeys(db, actor.workspaceId);
  const preview = buildImportPreview(parsed, mapping, existing);
  return ok({ parsed, mapping, preview });
}

export async function previewClientImport(
  db: AppDatabase,
  actor: Actor,
  text: unknown,
  rawMapping: unknown,
): Promise<Result<ImportPreviewResult>> {
  const access = await authorize(db, actor, "clients.import");
  if (!access.ok) return access;
  const result = await analyse(db, actor, text, rawMapping);
  if (!result.ok) return result;
  const { parsed, mapping, preview } = result.value;
  return ok({
    headers: parsed.headers,
    sample: parsed.rows.slice(0, 3),
    mapping,
    totalRows: parsed.rows.length,
    truncated: false,
    valid: preview.valid,
    duplicates: preview.duplicates,
    errors: preview.errors,
    rows: preview.rows.map((row) => (row.status === "valid" ? { line: row.line, status: "valid", name: row.data.name } : row)),
  });
}

export async function commitClientImport(
  db: AppDatabase,
  actor: Actor,
  text: unknown,
  rawMapping: unknown,
): Promise<Result<{ imported: number; duplicates: number; errors: number }>> {
  const access = await authorize(db, actor, "clients.import");
  if (!access.ok) return access;
  const result = await analyse(db, actor, text, rawMapping);
  if (!result.ok) return result;
  const { mapping, preview } = result.value;
  if (mapping.name < 0) return invalid("Scegli la colonna con il nome del cliente.");
  const valid = preview.rows.flatMap((row) => (row.status === "valid" ? [row.data] : []));
  if (valid.length === 0) return invalid("Nessuna riga valida da importare.");
  const now = new Date();
  const values = valid.map((data) => ({
    id: createId(),
    workspaceId: actor.workspaceId,
    ...data,
    createdAt: now,
    updatedAt: now,
  }));
  const chunks: Array<typeof values> = [];
  for (let index = 0; index < values.length; index += 100) chunks.push(values.slice(index, index + 100));
  const [first, ...rest] = chunks.map((chunk) => db.insert(clients).values(chunk));
  if (first) await db.batch([first, ...rest]);
  await writeAuditLog(db, {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action: "client.imported",
    entityType: "client",
    meta: { imported: valid.length, duplicates: preview.duplicates, errors: preview.errors },
  });
  return ok({ imported: valid.length, duplicates: preview.duplicates, errors: preview.errors });
}
