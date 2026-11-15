/**
 * Team invitation email. Same system layout as password reset: logo, hero, CTA button, expiry, security note.
 */

import { inviteRoleLabels, type InviteRole } from "@/domain/invites";
import { emailCtaButton, escapeHtml, renderSystemEmail, SYSTEM_EMAIL, type RenderedEmail } from "@/server/email/system-layout";

export const INVITE_DAYS = 7;
export const INVITE_TTL_MS = INVITE_DAYS * 24 * 60 * 60 * 1000;

export type InviteEmailInput = {
  url: string;
  workspaceName: string;
  inviterName: string;
  role: InviteRole;
  days?: number;
  year?: number;
  assetBase?: string;
};

export function inviteEmailSubject(workspaceName: string): string {
  return `Invito a ${workspaceName} su CTRL Quotes`;
}

export function renderInviteEmail(input: InviteEmailInput): RenderedEmail {
  const days = input.days ?? INVITE_DAYS;
  const url = input.url.trim();
  const safe = escapeHtml(url);
  const workspace = escapeHtml(input.workspaceName);
  const inviter = escapeHtml(input.inviterName);
  const role = inviteRoleLabels[input.role];
  const { ink, muted, font } = SYSTEM_EMAIL;

  const bodyHtml = `${emailCtaButton("Accetta l'invito", url)}
<p style="margin:20px 0 0 0;font-family:${font};font-size:13px;line-height:1.5;color:${muted};">Se il pulsante non funziona, copia questo link nel browser:</p>
<p style="margin:8px 0 0 0;font-family:${font};font-size:13px;line-height:1.5;word-break:break-all;"><a href="${safe}" style="color:${ink};text-decoration:underline;">${safe}</a></p>`;

  const bodyText = `${input.inviterName} ti invita a unirti a ${input.workspaceName} come ${role}.\n\nAccetta l'invito: ${url}\n\nSe il pulsante non funziona, copia il link nel browser.`;

  return renderSystemEmail({
    subject: inviteEmailSubject(input.workspaceName),
    preheader: `${input.inviterName} ti invita a ${input.workspaceName}. Il link è valido per ${days} giorni.`,
    titleHtml: "Sei stato<br>invitato",
    titleText: "Sei stato invitato",
    subtitle: `${inviter} ti invita a unirti a ${workspace} come ${role}.`,
    bodyHtml,
    bodyText,
    validityHtml: `Il link è valido per <strong style="color:${ink};font-weight:700;">${days} giorni</strong> e si può usare una sola volta.`,
    validityText: `Il link è valido per ${days} giorni e si può usare una sola volta.`,
    securityTitle: "Non aspettavi questo invito?",
    securityBody: "Ignora questa email: nessun account viene creato e non entri nel workspace.",
    year: input.year,
    assetBase: input.assetBase,
  });
}
