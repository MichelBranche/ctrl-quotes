/**
 * Trial reminder (2 days left) and expiry emails, same system layout as the other transactional messages.
 */
import { BILLING_PATH } from "@/domain/plans";
import { emailAssetBase, emailCtaButton, escapeHtml, renderSystemEmail, SYSTEM_EMAIL, type RenderedEmail } from "@/server/email/system-layout";

export type TrialNoticeKind = "reminder" | "expired";

export type TrialNoticeInput = {
  kind: TrialNoticeKind;
  ownerName: string | null;
  workspaceName: string;
  daysLeft?: number;
  billingUrl: string;
  year?: number;
  assetBase?: string;
};

export function trialBillingUrl(base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "https://quotes.ctrlagency.dev"): string {
  return `${base.replace(/\/$/, "")}${BILLING_PATH}`;
}

export function renderTrialNoticeEmail(input: TrialNoticeInput): RenderedEmail {
  const first = input.ownerName?.trim().split(/\s+/)[0] ?? "";
  const greeting = first ? `Ciao ${escapeHtml(first)},` : "Ciao,";
  const studio = escapeHtml(input.workspaceName);
  const { ink, font } = SYSTEM_EMAIL;
  if (input.kind === "reminder") {
    const days = input.daysLeft === 1 ? "1 giorno" : `${input.daysLeft ?? 2} giorni`;
    const bodyHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="text-align:left;">
<tr><td style="font-family:${font};font-size:15px;line-height:1.6;color:${ink};">
<p style="margin:0 0 14px;">${greeting}</p>
<p style="margin:0 0 14px;">La prova gratuita di <strong>${studio}</strong> termina tra ${escapeHtml(days)}. Dopo quella data i dati restano al sicuro, ma per continuare a modificare preventivi e impostazioni serve un abbonamento.</p>
</td></tr>
<tr><td style="padding:8px 0 0;">${emailCtaButton("Vai all'abbonamento", input.billingUrl)}</td></tr>
</table>`;
    return renderSystemEmail({
      subject: "La tua prova gratuita sta per terminare",
      preheader: `Restano ${days} alla prova di ${input.workspaceName}.`,
      titleHtml: "La prova sta<br>per terminare",
      titleText: "La prova sta per terminare",
      subtitle: `Restano ${days} alla prova gratuita.`,
      bodyHtml,
      bodyText: `${first ? `Ciao ${first},` : "Ciao,"}\n\nLa prova gratuita di ${input.workspaceName} termina tra ${days}. Dopo quella data i dati restano al sicuro, ma per continuare a modificare preventivi e impostazioni serve un abbonamento.\n\nApri l'abbonamento: ${input.billingUrl}`,
      securityTitle: "I tuoi dati restano al sicuro",
      securityBody: "Nessun dato viene cancellato alla scadenza della prova. Puoi attivare un piano in qualsiasi momento.",
      year: input.year,
      assetBase: input.assetBase ?? emailAssetBase(),
    });
  }

  const bodyHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="text-align:left;">
<tr><td style="font-family:${font};font-size:15px;line-height:1.6;color:${ink};">
<p style="margin:0 0 14px;">${greeting}</p>
<p style="margin:0 0 14px;">La prova gratuita di <strong>${studio}</strong> è terminata. Puoi ancora consultare i preventivi e i dati già salvati. Per tornare a modificare e inviare, attiva un abbonamento.</p>
</td></tr>
<tr><td style="padding:8px 0 0;">${emailCtaButton("Attiva un abbonamento", input.billingUrl)}</td></tr>
</table>`;
  return renderSystemEmail({
    subject: "La tua prova gratuita è terminata",
    preheader: `La prova di ${input.workspaceName} è terminata.`,
    titleHtml: "La prova gratuita<br>è terminata",
    titleText: "La prova gratuita è terminata",
    subtitle: "I tuoi dati restano al sicuro. Attiva un piano per continuare a lavorare.",
    bodyHtml,
    bodyText: `${first ? `Ciao ${first},` : "Ciao,"}\n\nLa prova gratuita di ${input.workspaceName} è terminata. Puoi ancora consultare i preventivi e i dati già salvati. Per tornare a modificare e inviare, attiva un abbonamento.\n\nAttiva un abbonamento: ${input.billingUrl}`,
    securityTitle: "I tuoi dati restano al sicuro",
    securityBody: "Nessun dato è stato cancellato. I link pubblici dei preventivi già inviati continuano a funzionare.",
    year: input.year,
    assetBase: input.assetBase ?? emailAssetBase(),
  });
}
