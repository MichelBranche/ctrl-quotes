"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
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
    <form action={action} className="card stack" style={{ padding: 20 }}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {state.fieldErrors?.saved ? <p className="alert alert-success">{state.fieldErrors.saved}</p> : null}
      {state.error ? (
        <p className="alert" role="alert">
          {state.error}
        </p>
      ) : null}
      <TextField label={messages.settings.name} name="name" defaultValue={workspaceName} required disabled={!canEdit} />
      {canEdit ? (
        <Button type="submit" loading={pending}>
          {messages.settings.save}
        </Button>
      ) : (
        <p className="field-hint">{messages.settings.memberHint}</p>
      )}
    </form>
  );
}
