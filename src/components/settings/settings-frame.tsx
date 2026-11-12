"use client";

import type { ReactNode } from "react";
import { Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SettingsFrame({
  title,
  subtitle,
  canEdit,
  dirty,
  pending,
  saved,
  error,
  children,
}: {
  title: string;
  subtitle: string;
  canEdit: boolean;
  dirty: boolean;
  pending: boolean;
  saved: boolean;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <div className="card settings-card">
      <header className="settings-head">
        <div>
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
        </div>
        {canEdit ? (
          <div className="save-area">
            <span className="save-status" aria-live="polite">
              {pending ? "Salvataggio…" : dirty ? "Modifiche non salvate" : saved ? (
                <>
                  <Check size={14} aria-hidden="true" /> Modifiche salvate
                </>
              ) : null}
            </span>
            <Button type="submit" loading={pending} disabled={!dirty}>
              <Check size={16} aria-hidden="true" /> Salva modifiche
            </Button>
          </div>
        ) : (
          <p className="readonly-note">
            <Lock size={14} aria-hidden="true" /> Solo proprietario e amministratori possono modificare.
          </p>
        )}
      </header>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      {children}
    </div>
  );
}
