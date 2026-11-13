import "server-only";

/**
 * Removes personal data and secrets from anything that goes to logs: link tokens, emails,
 * IP addresses and long opaque strings. Every public route logs through safeLog.
 */
const patterns: Array<[RegExp, string]> = [
  [/\/q\/[A-Za-z0-9_-]+/g, "/q/[token]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]"],
  [/\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, "[ip]"],
  [/(?:\b[0-9a-fA-F]{1,4})?(?::[0-9a-fA-F]{1,4}){0,6}::(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,6})?\b/g, "[ip]"],
  // Long opaque strings (tokens, keys). UUIDs stay readable: they are our own ids.
  [/\b(?![0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b)[A-Za-z0-9_-]{32,}/g, "[segreto]"],
];

export function redact(value: string): string {
  return patterns.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") return redact(value);
  if (value instanceof Error) return redact(`${value.name}: ${value.message}`);
  if (Array.isArray(value)) return value.map(redactUnknown);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactUnknown(item)]));
  }
  return value;
}

export function safeLog(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>): void {
  const line = redact(message);
  if (meta) console[level](line, redactUnknown(meta));
  else console[level](line);
}
