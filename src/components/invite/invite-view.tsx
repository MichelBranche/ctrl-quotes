"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { invitePath } from "@/domain/invite-path";
import { inviteRoleLabels, type InviteRole } from "@/domain/invites";
import { logoutAction } from "@/server/actions";
import { acceptInviteAction, forgetInviteTokenAction, rememberInviteTokenAction, type InviteActionState } from "@/server/actions/invites";
import { AuthSubmit } from "@/components/auth/auth-submit";
import { Button } from "@/components/ui/button";

export type InvitePreviewView = {
  workspaceName: string;
  role: InviteRole;
  roleLabel: string;
  inviterName: string;
  email: string;
  expiresLabel: string;
  status: "pending" | "accepted" | "revoked" | "expired";
};

const initial: InviteActionState = {};

export function InviteView({
  token,
  preview,
  session,
}: {
  token: string;
  preview: InvitePreviewView | null;
  session: { email: string; name: string } | null;
}) {
  const [state, action, pending] = useActionState(acceptInviteAction, initial);
  const path = token ? invitePath(token) : "";

  const live = Boolean(token && preview && preview.status === "pending");
  useEffect(() => {
    if (live) void rememberInviteTokenAction(token);
    else void forgetInviteTokenAction();
  }, [live, token]);

  if (!preview || preview.status === "revoked" || preview.status === "expired" || !token) {
    const reason =
      preview?.status === "revoked"
        ? "Questo invito è stato revocato."
        : preview?.status === "expired"
          ? "Questo invito è scaduto. Chiedi un nuovo invito a chi gestisce il workspace."
          : "Invito non valido o scaduto.";
    return (
      <>
        <h1>Invito non disponibile</h1>
        <p className="lede">{reason}</p>
        <p className="field-hint">Chi ti ha invitato può mandartene uno nuovo da Impostazioni, Team.</p>
        <p>
          <Link href={session ? "/app/overview" : "/login"}>{session ? "Continua" : "Accedi"}</Link>
        </p>
      </>
    );
  }

  if (preview.status === "accepted") {
    return (
      <>
        <h1>Invito già accettato</h1>
        <p className="lede">Questo invito a {preview.workspaceName} è già stato usato.</p>
        <p>
          <Link href={session ? "/app/overview" : "/login"}>{session ? "Vai alla panoramica" : "Accedi"}</Link>
        </p>
      </>
    );
  }

  if (!session) {
    const next = encodeURIComponent(path);
    return (
      <>
        <h1>Invito al team</h1>
        <p className="lede">
          {preview.inviterName} ti invita a unirti a <strong>{preview.workspaceName}</strong> come {preview.roleLabel}.
        </p>
        <p className="field-hint">L&apos;invito è per {preview.email} e scade il {preview.expiresLabel}.</p>
        <div className="stack-tight invite-actions">
          <Link className="btn btn-primary" href={`/login?next=${next}`}>
            Accedi e accetta
          </Link>
          <Link className="btn btn-secondary" href={`/register?next=${next}`}>
            Crea un account
          </Link>
        </div>
      </>
    );
  }

  const sameEmail = session.email.trim().toLowerCase() === preview.email;
  if (!sameEmail) {
    return (
      <>
        <h1>Email diversa</h1>
        <p className="lede">
          Questo invito a {preview.workspaceName} è per <strong>{preview.email}</strong>. Sei connesso come {session.email}.
        </p>
        <form action={logoutAction} className="stack-tight">
          <input type="hidden" name="next" value={path} />
          <Button type="submit">Esci e accedi con l&apos;email giusta</Button>
        </form>
      </>
    );
  }

  return (
    <>
      <h1>Invito al team</h1>
      <p className="lede">
        {preview.inviterName} ti invita a unirti a <strong>{preview.workspaceName}</strong> come {inviteRoleLabels[preview.role]}.
      </p>
      <p className="field-hint">L&apos;invito scade il {preview.expiresLabel}.</p>
      <form action={action} className="stack-tight">
        <input type="hidden" name="token" value={token} />
        {state.error ? <p className="alert" role="alert">{state.error}</p> : null}
        <AuthSubmit loading={pending}>Accetta e entra</AuthSubmit>
      </form>
    </>
  );
}
