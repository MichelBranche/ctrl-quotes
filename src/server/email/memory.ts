import type { EmailDriver, EmailMessage } from "@/server/email/types";

export class MemoryEmailDriver implements EmailDriver {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }
}
