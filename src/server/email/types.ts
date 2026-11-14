export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Phase 4: replies go to the person who sent the quote, not to CTRL Quotes. */
  replyTo?: string;
  cc?: string[];
  attachments?: EmailAttachment[];
};

export interface EmailDriver {
  send(message: EmailMessage): Promise<void>;
}
