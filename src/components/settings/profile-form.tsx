"use client";

import { useActionState } from "react";
import { ArrowLeftRight, Building2, Check, Eye, Mail, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsFrame } from "@/components/settings/settings-frame";
import { TextField } from "@/components/ui/fields";
import { messages } from "@/i18n/it";
import { updateWorkspaceAction, type FormState } from "@/server/actions";

export function ProfileForm({
  workspaceId,
  workspaceName,
  workspaceSlug,
  canEdit,
}: {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(updateWorkspaceAction, {} as FormState);
  return (
    <form action={action}>
      <SettingsFrame
        section="profile"
        plain
        title={messages.settings.profile}
        subtitle="Nome, descrizione e preferenze generali."
        actions={
          canEdit ? (
            <Button type="submit" loading={pending}>
              <Check size={16} aria-hidden="true" /> {messages.settings.save}
            </Button>
          ) : (
            <p className="readonly-note">{messages.settings.memberHint}</p>
          )
        }
      >
        <div className="ss-cols">
        <section className="card inset stack">
          <h2 className="section-heading">
            <Building2 size={16} aria-hidden="true" /> Workspace
          </h2>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          {state.fieldErrors?.saved ? <p className="alert alert-success">{state.fieldErrors.saved}</p> : null}
          {state.error ? (
            <p className="alert" role="alert">
              {state.error}
            </p>
          ) : null}
          <TextField label={messages.settings.name} name="name" defaultValue={workspaceName} required disabled={!canEdit} />
          <TextField label={messages.settings.slug} name="slug" defaultValue={workspaceSlug} disabled={!canEdit} hint={messages.settings.slugHint} />
        </section>
        <section className="card inset stack">
          <h2 className="section-heading">
            <Eye size={16} aria-hidden="true" /> Dove compare il nome
          </h2>
          <ul className="ss-uses">
            <li>
              <ArrowLeftRight size={16} aria-hidden="true" /> Nel selettore dei workspace, in alto a destra
            </li>
            <li>
              <Users size={16} aria-hidden="true" /> Negli inviti ai membri del team
            </li>
            <li>
              <Mail size={16} aria-hidden="true" /> Nelle email inviate ai clienti con i preventivi
            </li>
          </ul>
        </section>
        </div>
      </SettingsFrame>
    </form>
  );
}
