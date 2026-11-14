"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsFrame } from "@/components/settings/settings-frame";
import { TextField } from "@/components/ui/fields";
import { messages } from "@/i18n/it";
import { updateWorkspaceAction, type FormState } from "@/server/actions";

export function ProfileForm({
  workspaceId,
  workspaceName,
  canEdit,
}: {
  workspaceId: string;
  workspaceName: string;
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
        <section className="card inset stack">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          {state.fieldErrors?.saved ? <p className="alert alert-success">{state.fieldErrors.saved}</p> : null}
          {state.error ? (
            <p className="alert" role="alert">
              {state.error}
            </p>
          ) : null}
          <TextField label={messages.settings.name} name="name" defaultValue={workspaceName} required disabled={!canEdit} />
          <p className="field-hint">Il nome compare nel selettore dei workspace, negli inviti e nelle email ai clienti.</p>
        </section>
      </SettingsFrame>
    </form>
  );
}
