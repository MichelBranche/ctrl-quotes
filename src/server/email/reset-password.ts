/**
 * Password reset email. The flow stays a link: only the look of the message changes.
 * Expiry follows Better Auth's emailAndPassword.resetPasswordTokenExpiresIn (default 3600s).
 */

import { emailCtaButton, escapeHtml, renderSystemEmail, SYSTEM_EMAIL, type RenderedEmail } from "@/server/email/system-layout";

/** Seconds. Same value Better Auth uses when the option is omitted. */
export const RESET_PASSWORD_EXPIRES_IN_SECONDS = 3600;
export const RESET_PASSWORD_MINUTES = RESET_PASSWORD_EXPIRES_IN_SECONDS / 60;
export const RESET_PASSWORD_SUBJECT = "Reimposta la tua password";

export type ResetPasswordEmailInput = {
  url: string;
  minutes?: number;
  year?: number;
  assetBase?: string;
};

export function renderResetPasswordEmail(input: ResetPasswordEmailInput): RenderedEmail {
  const minutes = input.minutes ?? RESET_PASSWORD_MINUTES;
  const url = input.url.trim();
  const safe = escapeHtml(url);
  const { ink, muted, font } = SYSTEM_EMAIL;

  const bodyHtml = `${emailCtaButton("Reimposta password", url)}
<p style="margin:20px 0 0 0;font-family:${font};font-size:13px;line-height:1.5;color:${muted};">Se il pulsante non funziona, copia questo link nel browser:</p>
<p style="margin:8px 0 0 0;font-family:${font};font-size:13px;line-height:1.5;word-break:break-all;"><a href="${safe}" style="color:${ink};text-decoration:underline;">${safe}</a></p>`;

  const bodyText = `Reimposta password: ${url}\n\nSe il pulsante non funziona, copia il link nel browser.`;

  return renderSystemEmail({
    subject: RESET_PASSWORD_SUBJECT,
    preheader: `Il link è valido per ${minutes} minuti.`,
    titleHtml: "Reimposta<br>la tua password",
    titleText: "Reimposta la tua password",
    subtitle: "Abbiamo ricevuto una richiesta di reimpostare la password del tuo account CTRL Quotes. Clicca il pulsante qui sotto per sceglierne una nuova.",
    bodyHtml,
    bodyText,
    validityHtml: `Il link è valido per <strong style="color:${ink};font-weight:700;">${minutes} minuti</strong>.`,
    validityText: `Il link è valido per ${minutes} minuti.`,
    securityTitle: "Non hai richiesto il reset?",
    securityBody: "Ignora questa email: la tua password resta invariata.",
    year: input.year,
    assetBase: input.assetBase,
  });
}
