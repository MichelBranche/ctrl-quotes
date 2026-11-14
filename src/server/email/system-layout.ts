/**
 * Shared, email-safe layout for CTRL Quotes system messages
 * (verification, password reset, and future team invites).
 * Tables + inline CSS, max-width 600, so Gmail, Outlook and Apple Mail keep the shape.
 */

export const DEFAULT_ASSET_BASE = "https://quotes.ctrlagency.dev/email";

export const SYSTEM_EMAIL = {
  pageBg: "#ede5fc",
  cardBg: "#ffffff",
  ink: "#1a1a1e",
  muted: "#6e6e73",
  faint: "#8e8e93",
  purple: "#7c3aed",
  purpleDeep: "#5b21b6",
  lilac: "#f3eefd",
  digitInk: "#4c1d95",
  font: "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
} as const;

export type RenderedEmail = { subject: string; html: string; text: string };

export type SystemEmailContent = {
  subject: string;
  preheader?: string;
  titleHtml: string;
  titleText: string;
  subtitle: string;
  bodyHtml: string;
  bodyText: string;
  validityHtml?: string;
  validityText?: string;
  securityTitle: string;
  securityBody: string;
  year?: number;
  assetBase?: string;
};

export function emailAssetBase(env: Record<string, string | undefined> = process.env): string {
  const raw = env.NEXT_PUBLIC_APP_URL ?? env.BETTER_AUTH_URL ?? "https://quotes.ctrlagency.dev";
  return `${raw.replace(/\/$/, "")}/email`;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Large rounded purple button, table-based so Outlook keeps the shape. */
export function emailCtaButton(label: string, url: string): string {
  const safe = escapeHtml(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
<tr>
<td align="center" bgcolor="${SYSTEM_EMAIL.purple}" style="background-color:${SYSTEM_EMAIL.purple};border-radius:999px;">
<a href="${safe}" style="display:inline-block;padding:16px 36px;font-family:${SYSTEM_EMAIL.font};font-size:16px;line-height:1.2;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
</td>
</tr>
</table>`;
}

export function renderSystemEmail(content: SystemEmailContent): RenderedEmail {
  const year = content.year ?? new Date().getFullYear();
  const assets = (content.assetBase ?? DEFAULT_ASSET_BASE).replace(/\/$/, "");
  const logo = `${assets}/logo.png`;
  const hero = `${assets}/hero.png`;
  const shield = `${assets}/shield.png`;
  const { pageBg, cardBg, ink, muted, faint, purple, lilac, font } = SYSTEM_EMAIL;
  const preheader = content.preheader ?? content.subtitle;
  const validityHtml = content.validityHtml
    ? `<tr>
<td align="center" style="padding:16px 36px 8px 36px;">
<p style="margin:0;font-family:${font};font-size:14px;line-height:1.5;color:${muted};">${content.validityHtml}</p>
</td>
</tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${pageBg};font-family:${font};color:${ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${pageBg};margin:0;padding:0;">
<tr>
<td align="center" style="padding:32px 16px;background:${pageBg};">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${cardBg};border-radius:36px;">
<tr>
<td style="padding:36px 36px 24px 36px;">
<img src="${escapeHtml(logo)}" width="190" height="52" alt="CTRL® Quotes" style="display:block;width:190px;height:auto;border:0;outline:none;text-decoration:none;">
</td>
</tr>
<tr>
<td style="padding:0 28px 12px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${purple}" style="background-color:${purple};background-image:linear-gradient(115deg,#9b5cff 0%,#7c3aed 48%,#5b21b6 100%);border-radius:24px;overflow:hidden;">
<tr>
<td valign="middle" style="padding:28px 12px 28px 28px;width:58%;">
<h1 style="margin:0 0 12px 0;font-family:${font};font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-0.03em;color:#ffffff;">${content.titleHtml}</h1>
<p style="margin:0;font-family:${font};font-size:14px;line-height:1.45;color:#f3e8ff;">${escapeHtml(content.subtitle)}</p>
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
${content.bodyHtml}
</td>
</tr>
${validityHtml}
<tr>
<td style="padding:24px 36px 8px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${lilac}" style="background:${lilac};border-radius:18px;">
<tr>
<td valign="middle" width="56" style="padding:18px 8px 18px 20px;width:56px;">
<img src="${escapeHtml(shield)}" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border:0;outline:none;">
</td>
<td valign="middle" style="padding:18px 20px 18px 8px;">
<p style="margin:0 0 4px 0;font-family:${font};font-size:15px;line-height:1.35;font-weight:700;color:${ink};">${escapeHtml(content.securityTitle)}</p>
<p style="margin:0;font-family:${font};font-size:14px;line-height:1.45;color:${muted};">${escapeHtml(content.securityBody)}</p>
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
<p style="margin:0;font-family:${font};font-size:12px;line-height:1.5;color:${faint};">© ${year} CTRL® Quotes. Tutti i diritti riservati.</p>
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
    content.titleText,
    "",
    content.subtitle,
    "",
    content.bodyText,
    content.validityText ? `\n${content.validityText}\n` : "",
    `${content.securityTitle} ${content.securityBody}`,
    "",
    `© ${year} CTRL® Quotes. Tutti i diritti riservati.`,
  ]
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
    .join("\n");

  return { subject: content.subject, html, text };
}
