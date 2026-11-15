/**
 * Creates a redeem code. Uses DATABASE_URL (+ TURSO_AUTH_TOKEN) like the app.
 * The database stores only the SHA-256 hash of the normalized code.
 *
 *   npm run redeem:create -- --plan pro --kind free_month --days 30 --max-uses 50 --expires 2027-01-31
 *   npm run redeem:create -- --plan business --kind lifetime --write-secret /path/to/file
 *
 * --code is optional (default: random CQ-XXXX-XXXX). Matching is case-insensitive.
 * --write-secret writes the plaintext code to that path (mode 600) and does not print the code.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { createClient } from "@libsql/client";

const { values } = parseArgs({
  options: {
    plan: { type: "string", default: "pro" },
    kind: { type: "string", default: "free_month" },
    days: { type: "string", default: "30" },
    "max-uses": { type: "string", default: "1" },
    expires: { type: "string" },
    code: { type: "string" },
    "write-secret": { type: "string" },
  },
});

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function randomCode(): string {
  const chars = Array.from(randomBytes(8), (byte) => ALPHABET[byte % ALPHABET.length]).join("");
  return `CQ-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

function hashRedeemCode(normalized: string): string {
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

const plan = values.plan ?? "pro";
const kind = values.kind ?? "free_month";
if (!["starter", "pro", "business"].includes(plan)) throw new Error("--plan: starter | pro | business");
if (!["free_month", "lifetime"].includes(kind)) throw new Error("--kind: free_month | lifetime");
const days = kind === "lifetime" ? null : Number(values.days);
if (days !== null && (!Number.isInteger(days) || days <= 0)) throw new Error("--days: intero > 0");
const maxUses = Number(values["max-uses"]);
if (!Number.isInteger(maxUses) || maxUses <= 0) throw new Error("--max-uses: intero > 0");
const expiresAt = values.expires ? new Date(`${values.expires}T23:59:59`).getTime() : null;
if (expiresAt !== null && Number.isNaN(expiresAt)) throw new Error("--expires: data YYYY-MM-DD");
const code = (values.code ?? randomCode()).replace(/\s+/g, "").toUpperCase();
if (!/^[A-Z0-9-]{4,40}$/.test(code)) throw new Error("--code: lettere, numeri e trattini, 4-40 caratteri");
const secretPath = values["write-secret"];

const client = createClient({ url: process.env.DATABASE_URL ?? "file:./data/local.db", authToken: process.env.TURSO_AUTH_TOKEN });
await client.execute({
  sql: "insert into redeem_codes (id, code, kind, days, plan, max_uses, used_count, expires_at, created_at) values (?, ?, ?, ?, ?, ?, 0, ?, ?)",
  args: [randomUUID(), hashRedeemCode(code), kind, days, plan, maxUses, expiresAt, Date.now()],
});

const summary = `${kind === "lifetime" ? "a vita" : `${days} giorni`}, piano ${plan}, ${maxUses} utilizzi${expiresAt ? `, scade il ${values.expires}` : ""}`;
if (secretPath) {
  mkdirSync(dirname(secretPath), { recursive: true });
  writeFileSync(secretPath, `${code}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(secretPath, 0o600);
  console.log(`Codice creato e salvato in ${secretPath} (${summary}). Il testo in chiaro non viene stampato.`);
} else {
  console.log(`Codice creato: ${code} (${summary})`);
}
