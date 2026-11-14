import "server-only";
import { emailDeliveryLive, getEmailDriver } from "@/server/email";
import type { EmailDriver } from "@/server/email/types";
import { createRateLimiter, type RateLimiter, type RateRule } from "@/server/rate-limit";
import { redact, safeLog } from "@/server/redact";

/** Inbox approved for operational alerts. Override with ERROR_ALERT_EMAIL if needed. */
export const ERROR_ALERT_TO = "good-soup-ink-cpp4qj@mail.grokbot.com";

export const errorAlertRule: RateRule = { name: "error-alert", limit: 8, windowSec: 60 * 60 };
export const errorDigestRule: RateRule = { name: "error-alert-digest", limit: 1, windowSec: 60 * 60 };

export type ErrorReport = {
  message: string;
  digest?: string;
  route?: string;
  method?: string;
  source: "request" | "boundary" | "global" | "manual";
};

export type ErrorAlertDeps = {
  now?: Date;
  live?: boolean;
  email?: EmailDriver;
  limiter?: RateLimiter;
  to?: string;
};

const memoryWindows = new Map<string, { start: number; count: number }>();

export function memoryRateLimiter(): RateLimiter {
  return {
    async hit(rule, subject, now = Date.now()) {
      const windowMs = rule.windowSec * 1000;
      const start = Math.floor(now / windowMs) * windowMs;
      const key = `${rule.name}:${subject}`;
      const current = memoryWindows.get(key);
      const count = !current || current.start !== start ? 1 : current.count + 1;
      memoryWindows.set(key, { start, count });
      return { ok: count <= rule.limit, remaining: Math.max(0, rule.limit - count), resetAt: start + windowMs };
    },
  };
}

export function resetMemoryRateLimiter(): void {
  memoryWindows.clear();
}

function alertTo(): string {
  const configured = process.env.ERROR_ALERT_EMAIL?.trim();
  return configured && configured.includes("@") ? configured : ERROR_ALERT_TO;
}

/** Redacts a report so logs and emails never carry PII, tokens or raw URLs with secrets. */
export function sanitizeReport(input: ErrorReport): ErrorReport {
  const message = redact(String(input.message ?? "")).slice(0, 500);
  const digest = input.digest ? redact(String(input.digest)).slice(0, 80) : undefined;
  const route = input.route ? redact(String(input.route)).slice(0, 200) : undefined;
  const method = input.method ? String(input.method).slice(0, 12) : undefined;
  return { message, digest, route, method, source: input.source };
}

function formatRome(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Europe/Rome",
  }).format(date);
}

export function renderErrorAlert(report: ErrorReport, now: Date): { subject: string; text: string; html: string } {
  const clean = sanitizeReport(report);
  const when = formatRome(now);
  const lines = [
    `Un errore è stato segnalato da CTRL Quotes in produzione.`,
    `Orario (Europe/Rome): ${when}`,
    `Origine: ${clean.source}`,
    clean.method ? `Metodo: ${clean.method}` : null,
    clean.route ? `Percorso: ${clean.route}` : null,
    clean.digest ? `Digest: ${clean.digest}` : null,
    `Messaggio (già ripulito da dati personali e segreti):`,
    clean.message || "(vuoto)",
    "",
    "Questo avviso è tecnico: non contiene cookie, email o token.",
  ].filter((line): line is string => line !== null);
  const text = lines.join("\n");
  const html = `<p>Un errore è stato segnalato da CTRL Quotes in produzione.</p>
<ul>
<li>Orario (Europe/Rome): ${escapeHtml(when)}</li>
<li>Origine: ${escapeHtml(clean.source)}</li>
${clean.method ? `<li>Metodo: ${escapeHtml(clean.method)}</li>` : ""}
${clean.route ? `<li>Percorso: ${escapeHtml(clean.route)}</li>` : ""}
${clean.digest ? `<li>Digest: ${escapeHtml(clean.digest)}</li>` : ""}
</ul>
<p>Messaggio (già ripulito da dati personali e segreti):</p>
<pre>${escapeHtml(clean.message || "(vuoto)")}</pre>
<p>Questo avviso è tecnico: non contiene cookie, email o token.</p>`;
  return { subject: "CTRL Quotes: errore in produzione", text, html };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function resolveLimiter(provided?: RateLimiter): Promise<RateLimiter> {
  if (provided) return provided;
  try {
    const { getDb } = await import("@/db/client");
    return createRateLimiter(getDb());
  } catch (error) {
    safeLog("warn", "avviso errore: limite in memoria, database non disponibile", { error });
    return memoryRateLimiter();
  }
}

/**
 * Logs a sanitized error and, in production with Resend live, emails a rate-limited alert.
 * Never throws: monitoring must not break the request that already failed.
 */
export async function reportServerError(input: ErrorReport, deps: ErrorAlertDeps = {}): Promise<"sent" | "limited" | "logged"> {
  const clean = sanitizeReport(input);
  const now = deps.now ?? new Date();
  safeLog("error", "[error-alert] errore applicazione", {
    source: clean.source,
    method: clean.method,
    route: clean.route,
    digest: clean.digest,
    message: clean.message,
  });
  const live = deps.live ?? (process.env.VERCEL_ENV === "production" && emailDeliveryLive());
  if (!live) return "logged";
  try {
    const limiter = await resolveLimiter(deps.limiter);
    const globalHit = await limiter.hit(errorAlertRule, "global", now.getTime());
    if (!globalHit.ok) return "limited";
    if (clean.digest) {
      const digestHit = await limiter.hit(errorDigestRule, clean.digest, now.getTime());
      if (!digestHit.ok) return "limited";
    }
    const rendered = renderErrorAlert(clean, now);
    const email = deps.email ?? getEmailDriver();
    await email.send({
      to: deps.to ?? alertTo(),
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
    return "sent";
  } catch (error) {
    safeLog("error", "[error-alert] invio avviso non riuscito", { error });
    return "logged";
  }
}
