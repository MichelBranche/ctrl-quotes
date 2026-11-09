import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Resend } from "resend";
import type { EmailDriver, EmailMessage } from "@/server/email/types";

class ConsoleEmailDriver implements EmailDriver {
  async send(message: EmailMessage): Promise<void> {
    console.info(
      `[email:console] to=${message.to} subject=${message.subject}\n${message.text}`,
    );
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
    await fs.promises.appendFile(this.filePath, `${JSON.stringify(message)}\n`, "utf8");
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

let singleton: EmailDriver | undefined;

export function getEmailDriver(): EmailDriver {
  singleton ??= createEmailDriver();
  return singleton;
}

export async function readFileEmails(limit = 20): Promise<EmailMessage[]> {
  const filePath = emailFilePath();
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as EmailMessage)
      .slice(-limit);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
