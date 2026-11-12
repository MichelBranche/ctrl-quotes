import { clientInputSchema, firstIssue, type ClientInput } from "@/domain/clients";

export const csvLimits = { maxBytes: 1024 * 1024, maxRows: 1000 } as const;

export type ParsedCsv = { headers: string[]; rows: string[][]; delimiter: "," | ";" | "\t" };

function detectDelimiter(firstLine: string): ParsedCsv["delimiter"] {
  const counts = { ",": 0, ";": 0, "\t": 0 } as Record<ParsedCsv["delimiter"], number>;
  let quoted = false;
  for (const char of firstLine) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "," || char === ";" || char === "\t")) counts[char] += 1;
  }
  if (counts[";"] >= counts[","] && counts[";"] >= counts["\t"] && counts[";"] > 0) return ";";
  if (counts["\t"] > counts[","]) return "\t";
  return ",";
}

/** RFC 4180 parser with BOM, CRLF, quoted separators and escaped quotes. */
export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^\uFEFF/, "");
  const firstLineEnd = text.search(/\r?\n/);
  const delimiter = detectDelimiter(firstLineEnd === -1 ? text : text.slice(0, firstLineEnd));
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === delimiter) {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  const nonEmpty = records.filter((row) => row.some((cell) => cell.trim() !== ""));
  const [headerRow = [], ...rows] = nonEmpty;
  return { headers: headerRow.map((header) => header.trim()), rows, delimiter };
}

export const clientImportFields = [
  { key: "name", label: "Nome o ragione sociale", required: true },
  { key: "kind", label: "Tipo (azienda o privato)", required: false },
  { key: "status", label: "Stato (attivo o prospect)", required: false },
  { key: "email", label: "Email", required: false },
  { key: "phone", label: "Telefono", required: false },
  { key: "website", label: "Sito web", required: false },
  { key: "address", label: "Indirizzo", required: false },
  { key: "vatNumber", label: "Partita IVA", required: false },
  { key: "taxCode", label: "Codice fiscale", required: false },
  { key: "sector", label: "Settore", required: false },
] as const;

export type ClientImportField = (typeof clientImportFields)[number]["key"];

/** Field to column index. -1 means "not imported". */
export type ColumnMapping = Record<ClientImportField, number>;

const synonyms: Record<ClientImportField, string[]> = {
  name: ["nome", "ragione sociale", "ragionesociale", "cliente", "azienda", "denominazione", "name", "company", "nominativo"],
  kind: ["tipo", "tipologia", "kind", "type", "categoria cliente"],
  status: ["stato", "status"],
  email: ["email", "e-mail", "mail", "posta elettronica", "indirizzo email"],
  phone: ["telefono", "tel", "cellulare", "phone", "mobile", "numero"],
  website: ["sito", "sito web", "website", "web", "url"],
  address: ["indirizzo", "address", "sede", "via"],
  vatNumber: ["partita iva", "p.iva", "piva", "p. iva", "vat", "vat number", "partitaiva"],
  taxCode: ["codice fiscale", "cf", "c.f.", "tax code", "codicefiscale"],
  sector: ["settore", "sector", "industria", "attività", "attivita"],
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function guessMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping = {} as ColumnMapping;
  for (const field of clientImportFields) {
    const index = normalized.findIndex((header, position) => !used.has(position) && synonyms[field.key].includes(header));
    mapping[field.key] = index;
    if (index >= 0) used.add(index);
  }
  return mapping;
}

export function emptyMapping(): ColumnMapping {
  const mapping = {} as ColumnMapping;
  for (const field of clientImportFields) mapping[field.key] = -1;
  return mapping;
}

function kindFrom(raw: string, hasVat: boolean): "azienda" | "privato" | null {
  const value = raw.trim().toLowerCase();
  if (value === "") return hasVat ? "azienda" : "azienda";
  if (["azienda", "società", "societa", "impresa", "company", "business", "b2b", "ditta"].includes(value)) return "azienda";
  if (["privato", "persona", "persona fisica", "individual", "private", "b2c"].includes(value)) return "privato";
  return null;
}

function statusFrom(raw: string): "active" | "prospect" | null {
  const value = raw.trim().toLowerCase();
  if (value === "" || ["attivo", "attiva", "active", "cliente", "cliente attivo"].includes(value)) return "active";
  if (["prospect", "potenziale", "lead", "contatto"].includes(value)) return "prospect";
  return null;
}

export type ExistingClientKey = { name: string; email: string | null; vatNumber: string | null };

export type ImportRow =
  | { line: number; status: "valid"; data: ClientInput }
  | { line: number; status: "duplicate"; name: string; reason: string }
  | { line: number; status: "error"; name: string; reason: string };

export type ImportPreview = {
  rows: ImportRow[];
  valid: number;
  duplicates: number;
  errors: number;
};

function normalizeVat(value: string | null): string | null {
  return value ? value.replace(/\s/g, "").toUpperCase() : null;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function keysFor(entry: { name: string; email: string | null; vatNumber: string | null }): string[] {
  const keys: string[] = [];
  const vat = normalizeVat(entry.vatNumber);
  if (entry.email) keys.push(`email:${entry.email.toLowerCase()}`);
  if (vat) keys.push(`vat:${vat}`);
  if (keys.length === 0) keys.push(`name:${normalizeName(entry.name)}`);
  return keys;
}

/**
 * Validates every row with the same schema as the client form and flags duplicates
 * by email, VAT number or, when both are missing, by name. Line numbers count the header as line 1.
 */
export function buildImportPreview(
  parsed: ParsedCsv,
  mapping: ColumnMapping,
  existing: ExistingClientKey[],
): ImportPreview {
  if (mapping.name < 0) {
    return { rows: [], valid: 0, duplicates: 0, errors: 0 };
  }
  const existingKeys = new Set(existing.flatMap(keysFor));
  const seen = new Map<string, number>();
  const rows: ImportRow[] = [];
  parsed.rows.slice(0, csvLimits.maxRows).forEach((cells, index) => {
    const line = index + 2;
    const cell = (field: ClientImportField) => {
      const column = mapping[field];
      return column >= 0 ? (cells[column] ?? "").trim() : "";
    };
    const name = cell("name");
    const vat = cell("vatNumber");
    const kind = kindFrom(cell("kind"), vat !== "");
    const status = statusFrom(cell("status"));
    if (!kind) {
      rows.push({ line, status: "error", name, reason: `Tipo "${cell("kind")}" non riconosciuto. Usa azienda o privato.` });
      return;
    }
    if (!status) {
      rows.push({ line, status: "error", name, reason: `Stato "${cell("status")}" non riconosciuto. Usa attivo o prospect.` });
      return;
    }
    const parsedRow = clientInputSchema.safeParse({
      kind,
      name,
      status,
      sector: cell("sector"),
      email: cell("email"),
      phone: cell("phone"),
      website: cell("website"),
      address: cell("address"),
      vatNumber: vat,
      taxCode: cell("taxCode"),
    });
    if (!parsedRow.success) {
      rows.push({ line, status: "error", name, reason: firstIssue(parsedRow.error) });
      return;
    }
    const keys = keysFor(parsedRow.data);
    if (keys.some((key) => existingKeys.has(key))) {
      rows.push({ line, status: "duplicate", name: parsedRow.data.name, reason: "Già presente in rubrica." });
      return;
    }
    const firstLine = keys.map((key) => seen.get(key)).find((value) => value !== undefined);
    if (firstLine !== undefined) {
      rows.push({ line, status: "duplicate", name: parsedRow.data.name, reason: `Ripete la riga ${firstLine} del file.` });
      return;
    }
    for (const key of keys) seen.set(key, line);
    rows.push({ line, status: "valid", data: parsedRow.data });
  });
  return {
    rows,
    valid: rows.filter((row) => row.status === "valid").length,
    duplicates: rows.filter((row) => row.status === "duplicate").length,
    errors: rows.filter((row) => row.status === "error").length,
  };
}

export function mappingFromUnknown(raw: unknown, columnCount: number): ColumnMapping | null {
  if (!raw || typeof raw !== "object") return null;
  const mapping = emptyMapping();
  for (const field of clientImportFields) {
    const value = (raw as Record<string, unknown>)[field.key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value < -1 || value >= columnCount) return null;
    mapping[field.key] = value;
  }
  const used = Object.values(mapping).filter((value) => value >= 0);
  if (new Set(used).size !== used.length) return null;
  return mapping;
}
