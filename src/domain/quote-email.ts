/**
 * Content of the email that carries a quote to the client. Pure: the send dialog shows the very
 * same heading, message and footer as a live preview, and the server renders it to HTML and text.
 */

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
  return isUpdate ? "Il preventivo è stato aggiornato" : "Il tuo preventivo è pronto";
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

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function renderQuoteEmail(input: QuoteEmailInput): { html: string; text: string } {
  const heading = emailHeading(input.isUpdate);
  const footer = emailFooterLines(input);
  const color = buttonColor(input.brandColor);
  const initial = escapeHtml((input.studioName.trim()[0] ?? "S").toUpperCase());
  const paragraphs = input.message
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#4a4540">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const url = escapeHtml(input.url);
  const html = `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f1ec;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f1b18">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;border:1px solid #ece4da">
<tr><td style="padding:32px 32px 8px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:28px;height:28px;border-radius:14px;background:#1f1b18;color:#ffffff;font-size:13px;font-weight:700;text-align:center;line-height:28px">${initial}</td>
<td style="padding-left:10px;font-size:15px;font-weight:700;color:#1f1b18">${escapeHtml(input.studioName)}</td>
</tr></table>
<h1 style="margin:26px 0 14px;font-family:'Instrument Serif',Georgia,'Times New Roman',serif;font-weight:400;font-size:32px;line-height:1.1;color:#1f1b18">${escapeHtml(heading)}</h1>
${paragraphs}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px"><tr><td style="border-radius:999px;background:${color}">
<a href="${url}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">Apri il preventivo</a>
</td></tr></table>
<p style="margin:10px 0 0;font-size:12px;line-height:1.5;color:#6b635b">Se il pulsante non funziona, copia questo indirizzo nel browser:<br><a href="${url}" style="color:#6b5d50;word-break:break-all">${url}</a></p>
</td></tr>
<tr><td style="padding:20px 32px 28px"><div style="border-top:1px solid #eee7df;padding-top:16px;font-size:12px;line-height:1.6;color:#6b635b">${footer.map(escapeHtml).join("<br>")}</div></td></tr>
</table>
<p style="margin:16px 0 0;font-size:11px;color:#6b635b">Inviato con CTRL Quotes per conto di ${escapeHtml(input.studioName)}</p>
</td></tr></table></body></html>`;
  const text = [input.studioName, "", heading, "", input.message, "", `Apri il preventivo: ${input.url}`, "", ...footer, "", `Inviato con CTRL Quotes per conto di ${input.studioName}`].join("\n");
  return { html, text };
}
