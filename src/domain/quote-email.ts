/**
 * Content of the email that carries a quote to the client. Pure: the send dialog shows the very
 * same heading, message and footer as a live preview, and the server renders it to HTML and text.
 */

import { emailAssetBase, emailCtaButton, escapeHtml, renderSystemEmail, SYSTEM_EMAIL } from "@/server/email/system-layout";

export const EMAIL_LIMITS = { subject: 160, message: 2000, cc: 3 } as const;

export type QuoteEmailInput = {
  studioName: string;
  quoteNumber: string | null;
  quoteTitle: string;
  totalLabel: string;
  validUntilLabel: string | null;
  message: string;
  url: string;
  brandColor: string;
  isUpdate: boolean;
};

export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

export function defaultSubject(title: string, isUpdate: boolean): string {
  const clean = title.trim() || "il progetto";
  return (isUpdate ? `Preventivo aggiornato per ${clean}` : `Il tuo preventivo per ${clean}`).slice(0, EMAIL_LIMITS.subject);
}

export function defaultMessage(input: { recipientName: string | null; title: string; senderName: string | null; isUpdate: boolean }): string {
  const greeting = firstName(input.recipientName) ? `Ciao ${firstName(input.recipientName)},` : "Buongiorno,";
  const title = input.title.trim() || "il progetto";
  const body = input.isUpdate
    ? `ho aggiornato la proposta per ${title}. Trovi la versione nuova allo stesso link: puoi rileggerla, scaricare il PDF e accettarla online quando vuoi.`
    : `ecco la proposta per ${title}. Puoi leggerla con calma, scaricare il PDF e accettarla online quando vuoi. Per qualsiasi dubbio rispondi pure a questa email.`;
  const sign = firstName(input.senderName) ? `A presto, ${firstName(input.senderName)}` : "A presto";
  return `${greeting}\n${body}\n${sign}`;
}

export function emailHeading(isUpdate: boolean): string {
  return isUpdate ? "Il preventivo è stato aggiornato" : "Hai ricevuto un preventivo";
}

export function emailFooterLines(input: Pick<QuoteEmailInput, "quoteNumber" | "totalLabel" | "validUntilLabel">): string[] {
  return [
    [input.quoteNumber, input.totalLabel].filter(Boolean).join(" · "),
    input.validUntilLabel ? `Valido fino al ${input.validUntilLabel}` : "",
    "Il link è personale: non inoltrarlo.",
  ].filter(Boolean);
}

/** Brand color for the button only when white text stays readable on it, otherwise a warm ink. */
export function buttonColor(hex: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return "#1f1b18";
  const value = parseInt(match[1]!, 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  return (1.05 / (luminance + 0.05)) >= 4.5 ? `#${match[1]!.toLowerCase()}` : "#1f1b18";
}

export function renderQuoteEmail(input: QuoteEmailInput): { html: string; text: string } {
  const heading = emailHeading(input.isUpdate);
  const titleHtml = input.isUpdate ? "Il preventivo è<br>stato aggiornato" : "Hai ricevuto<br>un preventivo";
  const { ink, muted, font } = SYSTEM_EMAIL;
  const paragraphs = input.message
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 14px;font-family:${font};font-size:15px;line-height:1.6;color:${ink};text-align:left;">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const meta = [input.quoteNumber, input.totalLabel].filter(Boolean).join(" · ");
  const url = escapeHtml(input.url);
  const bodyHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="text-align:left;">
<tr><td style="font-family:${font};font-size:15px;line-height:1.6;color:${ink};">
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${ink};">Inviato da <strong>${escapeHtml(input.studioName)}</strong>.</p>
${meta ? `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;font-weight:700;color:${ink};">${escapeHtml(meta)}</p>` : ""}
${paragraphs}
</td></tr>
<tr><td style="padding:8px 0 12px;">${emailCtaButton("Apri il preventivo", input.url)}</td></tr>
<tr><td>
<p style="margin:8px 0 0;font-family:${font};font-size:12px;line-height:1.5;color:${muted};">Se il pulsante non funziona, copia questo indirizzo nel browser:<br><a href="${url}" style="color:${muted};word-break:break-all;">${url}</a></p>
</td></tr>
</table>`;
  const validityText = input.validUntilLabel ? `Valido fino al ${input.validUntilLabel}.` : undefined;
  const rendered = renderSystemEmail({
    subject: heading,
    preheader: `${input.studioName} ti ha inviato un preventivo${meta ? ` (${meta})` : ""}.`,
    titleHtml,
    titleText: heading,
    subtitle: `Inviato da ${input.studioName}.`,
    bodyHtml,
    bodyText: [
      `Inviato da ${input.studioName}.`,
      meta,
      "",
      input.message,
      "",
      `Apri il preventivo: ${input.url}`,
    ]
      .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
      .join("\n"),
    validityHtml: validityText ? escapeHtml(validityText) : undefined,
    validityText,
    securityTitle: "Link personale",
    securityBody: "Questo link è personale: non inoltrarlo. Se non aspettavi questo preventivo, puoi ignorare l'email.",
    assetBase: emailAssetBase(),
  });
  return { html: rendered.html, text: rendered.text };
}
