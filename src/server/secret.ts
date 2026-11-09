import fs from "node:fs";
import path from "node:path";

function loopbackUrl(url: string | undefined): boolean {
  if (!url) return true;
  return url.startsWith("http://localhost") || url.startsWith("http://127.0.0.1");
}

export function resolveAuthSecret(): string {
  const fromEnv = process.env.BETTER_AUTH_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;

  const local = process.env.NODE_ENV !== "production" || loopbackUrl(process.env.BETTER_AUTH_URL);
  if (process.env.VERCEL || !local) {
    throw new Error("BETTER_AUTH_SECRET è obbligatorio fuori dall'ambiente locale.");
  }

  const file = path.join(process.cwd(), "data", "dev-secret");
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing.length >= 32) return existing;
  } catch {
    // created below
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const secret = crypto.randomUUID() + crypto.randomUUID();
  fs.writeFileSync(file, secret, { encoding: "utf8", mode: 0o600 });
  return secret;
}
