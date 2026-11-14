/**
 * Email to the quote owner when the client opens, accepts or declines a proposal.
 * Same system layout as verification and the client quote email.
 */

import { emailAssetBase, emailCtaButton, escapeHtml, renderSystemEmail, SYSTEM_EMAIL, type RenderedEmail } from "@/server/email/system-layout";

export type OwnerNoticeType = "quote_viewed" | "quote_accepted" | "quote_rejected";

export type OwnerNoticeInput = {
  type: OwnerNoticeType;
  ownerName: string | null;
  studioName: string;
  quoteTitle: string;
  quoteNumber: string | null;
  quoteUrl: string;
  year?: number;
  assetBase?: string;
};

const copy: Record<OwnerNoticeType, { subject: string; titleHtml: string; titleText: string; subtitle: string; verb: string }> = {
  quote_viewed: {
    subject: "Un cliente ha aperto il preventivo",
    titleHtml: "Un cliente ha<br>aperto il preventivo",
    titleText: "Un cliente ha aperto il preventivo",
    subtitle: "Il destinatario ha aperto il link e sta guardando la proposta.",
    verb: "ha aperto",
  },
  quote_accepted: {
    subject: "Un cliente ha accettato il preventivo",
    titleHtml: "Un cliente ha<br>accettato il preventivo",
    titleText: "Un cliente ha accettato il preventivo",
    subtitle: "La proposta è stata accettata. Puoi vederne lo stato nell'app.",
    verb: "ha accettato",
  },
  quote_rejected: {
    subject: "Un cliente ha rifiutato il preventivo",
    titleHtml: "Un cliente ha<br>rifiutato il preventivo",
    titleText: "Un cliente ha rifiutato il preventivo",
    subtitle: "La proposta è stata rifiutata. Puoi vederne lo stato nell'app.",
    verb: "ha rifiutato",
  },
};

export function ownerNoticeTitle(type: OwnerNoticeType, quoteNumber: string | null, quoteTitle: string): string {
  const label = [quoteNumber, quoteTitle].filter(Boolean).join(" · ") || "un preventivo";
  if (type === "quote_viewed") return `Un cliente ha aperto il preventivo ${label}`;
  if (type === "quote_accepted") return `Il preventivo ${label} è stato accettato`;
  return `Il preventivo ${label} è stato rifiutato`;
}

export function renderOwnerNoticeEmail(input: OwnerNoticeInput): RenderedEmail {
  const item = copy[input.type];
  const meta = [input.quoteNumber, input.quoteTitle].filter(Boolean).join(" · ");
  const greeting = input.ownerName?.trim() ? `Ciao ${escapeHtml(input.ownerName.trim().split(/\s+/)[0] ?? "")},` : "Ciao,";
  const { ink, font } = SYSTEM_EMAIL;
  const bodyHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="text-align:left;">
<tr><td style="font-family:${font};font-size:15px;line-height:1.6;color:${ink};">
<p style="margin:0 0 14px;">${greeting}</p>
<p style="margin:0 0 14px;">Un cliente ${item.verb} il preventivo${meta ? ` <strong>${escapeHtml(meta)}</strong>` : ""} di ${escapeHtml(input.studioName)}.</p>
</td></tr>
<tr><td style="padding:8px 0 0;">${emailCtaButton("Apri il preventivo nell'app", input.quoteUrl)}</td></tr>
</table>`;
  return renderSystemEmail({
    subject: item.subject,
    preheader: item.subtitle,
    titleHtml: item.titleHtml,
    titleText: item.titleText,
    subtitle: item.subtitle,
    bodyHtml,
    bodyText: [
      input.ownerName?.trim() ? `Ciao ${input.ownerName.trim().split(/\s+/)[0]},` : "Ciao,",
      "",
      `Un cliente ${item.verb} il preventivo${meta ? ` ${meta}` : ""} di ${input.studioName}.`,
      "",
      `Apri il preventivo nell'app: ${input.quoteUrl}`,
    ].join("\n"),
    securityTitle: "Questa email è solo per te",
    securityBody: "Non contiene dati del cliente oltre allo stato del preventivo.",
    year: input.year,
    assetBase: input.assetBase ?? emailAssetBase(),
  });
}
