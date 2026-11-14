import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Resend } from "resend";
import type { EmailDriver, EmailMessage } from "@/server/email/types";
import { redact } from "@/server/redact";

/**
 * Prints instead of sending. In production the line is redacted: no addresses, links or tokens
 * end up in the Vercel logs. In local development the full text stays visible.
 */
export class ConsoleEmailDriver implements EmailDriver {
  constructor(private readonly production = process.env.NODE_ENV === "production") {}

  async send(message: EmailMessage): Promise<void> {
    const attachments = message.attachments?.map((item) => `${item.filename} (${item.content.length} byte)`).join(", ");
    const line = `[email:console] to=${message.to} subject=${message.subject}${attachments ? ` allegati=${attachments}` : ""}`;
    if (this.production) console.info(redact(line));
    else console.info(`${line}\n${message.text}`);
  }
}

function emailFilePath(): string {
  const requested = process.env.EMAIL_FILE_PATH ?? "emails.jsonl";
  return path.join(process.cwd(), "data", path.basename(requested));
}

class FileEmailDriver implements EmailDriver {
  constructor(private readonly filePath: string) {}

  async send(message: EmailMessage): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    // Attachments are recorded by name and size only: the mailbox file stays small and readable.
    const { attachments, ...rest } = message;
    const stored = attachments ? { ...rest, attachments: attachments.map((item) => ({ filename: item.filename, contentType: item.contentType, size: item.content.length })) } : rest;
    await fs.promises.appendFile(this.filePath, `${JSON.stringify(stored)}\n`, "utf8");
  }
}

class ResendEmailDriver implements EmailDriver {
  private readonly resend: Resend;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.resend = new Resend(apiKey);
    this.from = from;
  }

  async send(message: EmailMessage): Promise<void> {
    const result = await this.resend.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      replyTo: message.replyTo,
      cc: message.cc && message.cc.length > 0 ? message.cc : undefined,
      attachments: message.attachments?.map((item) => ({ filename: item.filename, content: item.content, contentType: item.contentType })),
    });
    if (result.error) {
      throw new Error(result.error.message);
    }
  }
}

export function createEmailDriver(): EmailDriver {
  const driver = process.env.EMAIL_DRIVER ?? "console";
  switch (driver) {
    case "console":
      return new ConsoleEmailDriver();
    case "file":
      return new FileEmailDriver(emailFilePath());
    case "resend": {
      const apiKey = process.env.RESEND_API_KEY;
      const from = process.env.EMAIL_FROM;
      if (!apiKey || !from) {
        throw new Error("RESEND_API_KEY e EMAIL_FROM sono obbligatori con EMAIL_DRIVER=resend.");
      }
      return new ResendEmailDriver(apiKey, from);
    }
    default:
      throw new Error(`Driver email sconosciuto: ${driver}`);
  }
}

/** True only when emails really leave: the send dialog says so when they do not. */
export function emailDeliveryLive(env: Record<string, string | undefined> = process.env): boolean {
  return env.EMAIL_DRIVER === "resend" && Boolean(env.RESEND_API_KEY) && Boolean(env.EMAIL_FROM);
}

let singleton: EmailDriver | undefined;

export function getEmailDriver(): EmailDriver {
  singleton ??= createEmailDriver();
  return singleton;
}

export type StoredEmail = Omit<EmailMessage, "attachments"> & { attachments?: Array<{ filename: string; contentType: string; size: number }> };

export async function readFileEmails(limit = 20): Promise<StoredEmail[]> {
  const filePath = emailFilePath();
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as StoredEmail)
      .slice(-limit);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
