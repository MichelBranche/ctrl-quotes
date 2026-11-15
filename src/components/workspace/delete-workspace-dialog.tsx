"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/fields";
import { HoldDelete } from "@/components/ui/destructive";
import { messages } from "@/i18n/it";
import { deleteWorkspaceAction } from "@/server/actions";

export type DeleteWorkspaceTarget = { id: string; name: string };

export function DeleteWorkspaceDialog({
  target,
  onClose,
}: {
  target: DeleteWorkspaceTarget | null;
  onClose: () => void;
}) {
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const [forId, setForId] = useState(target?.id);
  if (forId !== target?.id) {
    // A new target starts from an empty confirmation.
    setForId(target?.id);
    setConfirmName("");
    setError(undefined);
  }

  const matches = target ? confirmName.trim() === target.name : false;

  return (
    <Dialog open={Boolean(target)} title={messages.workspace.deleteTitle} onClose={onClose}>
      <p className="ws-delete-warning">{messages.workspace.deleteWarning}</p>
      {target ? (
        <p className="muted">
          Workspace: <strong>{target.name}</strong>
        </p>
      ) : null}
      <TextField
        label={messages.workspace.deleteConfirmLabel}
        name="confirmName"
        value={confirmName}
        onChange={(event) => setConfirmName(event.target.value)}
        autoComplete="off"
        disabled={pending || !target}
      />
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      <div className="dialog-actions">
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          {messages.workspace.deleteCancel}
        </Button>
        <HoldDelete
          label={matches ? "Tieni premuto per eliminare" : "Scrivi il nome per sbloccare"}
          disabled={!matches || pending || !target}
          onHold={() => {
            if (!target) return;
            start(async () => {
              const result = await deleteWorkspaceAction({ workspaceId: target.id, confirmName });
              if (result && !result.ok) setError(result.message);
            });
          }}
        />
      </div>
    </Dialog>
  );
}
