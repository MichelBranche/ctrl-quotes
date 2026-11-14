/**
 * Sign-up verification email: a 6-digit code, not a link.
 * Uses the shared system layout so it matches password reset and future team invites.
 */

import { emailAssetBase, escapeHtml, renderSystemEmail, SYSTEM_EMAIL, type RenderedEmail } from "@/server/email/system-layout";

export const VERIFICATION_OTP_SUBJECT = "Conferma la tua email";
export const VERIFICATION_OTP_MINUTES = 10;

export type VerificationOtpEmailInput = {
  otp: string;
  year?: number;
  assetBase?: string;
};

function digitsOf(otp: string): string[] {
  const digits = otp.replace(/\D/g, "").slice(0, 6).split("");
  while (digits.length < 6) digits.push("");
  return digits;
}

export function renderVerificationOtpEmail(input: VerificationOtpEmailInput): RenderedEmail {
  const digits = digitsOf(input.otp);
  const code = digits.join("");
  const { cardBg, lilac, digitInk, font } = SYSTEM_EMAIL;

  const digitCells = digits
    .map((digit, index) => {
      const pad = index === 0 ? "padding:12px 4px 12px 12px;" : index === 5 ? "padding:12px 12px 12px 4px;" : "padding:12px 4px;";
      return `<td align="center" valign="middle" style="${pad}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" valign="middle" width="48" height="56" style="width:48px;height:56px;background:${cardBg};border-radius:12px;font-family:${font};font-size:28px;font-weight:700;line-height:56px;color:${digitInk};letter-spacing:0;">${escapeHtml(digit)}</td>
</tr></table>
</td>`;
    })
    .join("");

  return renderSystemEmail({
    subject: VERIFICATION_OTP_SUBJECT,
    preheader: `Il tuo codice di verifica è ${code}. È valido per ${VERIFICATION_OTP_MINUTES} minuti.`,
    titleHtml: "Conferma<br>la tua email",
    titleText: "Conferma la tua email",
    subtitle: "Per completare la registrazione e attivare il tuo account, inserisci il codice di verifica qui sotto.",
    bodyHtml: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="${lilac}" style="background:${lilac};border-radius:22px;">
<tr>${digitCells}</tr>
</table>`,
    bodyText: `Codice: ${code}`,
    validityHtml: `Il codice è valido per <strong style="color:${SYSTEM_EMAIL.ink};font-weight:700;">${VERIFICATION_OTP_MINUTES} minuti</strong>.`,
    validityText: `Il codice è valido per ${VERIFICATION_OTP_MINUTES} minuti.`,
    securityTitle: "Non hai richiesto questa registrazione?",
    securityBody: "Puoi ignorare questa email in tutta sicurezza.",
    year: input.year,
    assetBase: input.assetBase,
  });
}

export { emailAssetBase };
