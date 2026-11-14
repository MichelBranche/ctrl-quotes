/**
 * Sign-up verification email: a 6-digit code, not a link.
 * HTML is table-based and inline-styled so it holds up in Gmail, Outlook and Apple Mail.
 */

export const VERIFICATION_OTP_SUBJECT = "Conferma la tua email";
export const VERIFICATION_OTP_MINUTES = 10;

const DEFAULT_ASSET_BASE = "https://quotes.ctrlagency.dev/email";
const PAGE_BG = "#ede5fc";
const CARD_BG = "#ffffff";
const INK = "#1a1a1e";
const MUTED = "#6e6e73";
const PURPLE = "#7c3aed";
const PURPLE_DEEP = "#5b21b6";
const LILAC = "#f3eefd";
const DIGIT_INK = "#4c1d95";

export type VerificationOtpEmailInput = {
  otp: string;
  year?: number;
  assetBase?: string;
};

export function emailAssetBase(env: Record<string, string | undefined> = process.env): string {
  const raw = env.NEXT_PUBLIC_APP_URL ?? env.BETTER_AUTH_URL ?? "https://quotes.ctrlagency.dev";
  return `${raw.replace(/\/$/, "")}/email`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function digitsOf(otp: string): string[] {
  const digits = otp.replace(/\D/g, "").slice(0, 6).split("");
  while (digits.length < 6) digits.push("");
  return digits;
}

export function renderVerificationOtpEmail(input: VerificationOtpEmailInput): { subject: string; html: string; text: string } {
  const year = input.year ?? new Date().getFullYear();
  const assets = (input.assetBase ?? DEFAULT_ASSET_BASE).replace(/\/$/, "");
  const logo = `${assets}/logo.png`;
  const hero = `${assets}/hero.png`;
  const shield = `${assets}/shield.png`;
  const digits = digitsOf(input.otp);
  const code = digits.join("");

  const digitCells = digits
    .map((digit, index) => {
      const pad = index === 0 ? "padding:12px 4px 12px 12px;" : index === 5 ? "padding:12px 12px 12px 4px;" : "padding:12px 4px;";
      return `<td align="center" valign="middle" style="${pad}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" valign="middle" width="48" height="56" style="width:48px;height:56px;background:${CARD_BG};border-radius:12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:28px;font-weight:700;line-height:56px;color:${DIGIT_INK};letter-spacing:0;">${escapeHtml(digit)}</td>
</tr></table>
</td>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${VERIFICATION_OTP_SUBJECT}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Il tuo codice di verifica è ${escapeHtml(code)}. È valido per ${VERIFICATION_OTP_MINUTES} minuti.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE_BG};margin:0;padding:0;">
<tr>
<td align="center" style="padding:32px 16px;background:${PAGE_BG};">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${CARD_BG};border-radius:36px;">
<tr>
<td style="padding:36px 36px 24px 36px;">
<img src="${escapeHtml(logo)}" width="190" height="52" alt="CTRL® Quotes" style="display:block;width:190px;height:auto;border:0;outline:none;text-decoration:none;">
</td>
</tr>
<tr>
<td style="padding:0 28px 12px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PURPLE}" style="background-color:${PURPLE};background-image:linear-gradient(115deg,#9b5cff 0%,#7c3aed 48%,#5b21b6 100%);border-radius:24px;overflow:hidden;">
<tr>
<td valign="middle" style="padding:28px 12px 28px 28px;width:58%;">
<h1 style="margin:0 0 12px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-0.03em;color:#ffffff;">Conferma<br>la tua email</h1>
<p style="margin:0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.45;color:#f3e8ff;">Per completare la registrazione e attivare il tuo account, inserisci il codice di verifica qui sotto.</p>
</td>
<td valign="bottom" align="right" style="padding:0;width:42%;line-height:0;font-size:0;">
<img src="${escapeHtml(hero)}" width="250" alt="" style="display:block;width:100%;max-width:250px;height:auto;border:0;outline:none;">
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td align="center" style="padding:28px 36px 8px 36px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="${LILAC}" style="background:${LILAC};border-radius:22px;">
<tr>${digitCells}</tr>
</table>
</td>
</tr>
<tr>
<td align="center" style="padding:16px 36px 8px 36px;">
<p style="margin:0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:${MUTED};">Il codice è valido per <strong style="color:${INK};font-weight:700;">10 minuti</strong>.</p>
</td>
</tr>
<tr>
<td style="padding:24px 36px 8px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${LILAC}" style="background:${LILAC};border-radius:18px;">
<tr>
<td valign="middle" width="56" style="padding:18px 8px 18px 20px;width:56px;">
<img src="${escapeHtml(shield)}" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border:0;outline:none;">
</td>
<td valign="middle" style="padding:18px 20px 18px 8px;">
<p style="margin:0 0 4px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.35;font-weight:700;color:${INK};">Non hai richiesto questa registrazione?</p>
<p style="margin:0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.45;color:${MUTED};">Puoi ignorare questa email in tutta sicurezza.</p>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:24px 36px 16px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="border-top:1px solid #eeeaf6;font-size:0;line-height:0;height:1px;">&nbsp;</td>
</tr></table>
</td>
</tr>
<tr>
<td align="center" style="padding:0 36px 36px 36px;">
<p style="margin:0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#8e8e93;">© ${year} CTRL® Quotes. Tutti i diritti riservati.</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;

  const text = [
    "CTRL® Quotes",
    "",
    "Conferma la tua email",
    "",
    "Per completare la registrazione e attivare il tuo account, inserisci il codice di verifica qui sotto.",
    "",
    `Codice: ${code}`,
    "",
    `Il codice è valido per ${VERIFICATION_OTP_MINUTES} minuti.`,
    "",
    "Non hai richiesto questa registrazione? Puoi ignorare questa email in tutta sicurezza.",
    "",
    `© ${year} CTRL® Quotes. Tutti i diritti riservati.`,
  ].join("\n");

  return { subject: VERIFICATION_OTP_SUBJECT, html, text };
}

export { PURPLE_DEEP };
