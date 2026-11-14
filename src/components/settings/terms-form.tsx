"use client";

import { useState } from "react";
import { SettingsFrame } from "@/components/settings/settings-frame";
import { TextAreaField } from "@/components/data/fields";
import { useAction } from "@/components/data/use-action";
import { TextField } from "@/components/ui/fields";
import { saveTermsAction } from "@/server/actions/settings";

export function TermsForm({ terms, validityDays, canEdit }: { terms: string | null; validityDays: number; canEdit: boolean }) {
  const initial = { defaultTerms: terms ?? "", defaultValidityDays: String(validityDays) };
  const [values, setValues] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useAction();
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
  const days = Number.parseInt(values.defaultValidityDays, 10);
  const daysError = Number.isInteger(days) && days >= 1 && days <= 365 ? undefined : "Indica un numero di giorni tra 1 e 365.";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (daysError) return;
        run(
          () => saveTermsAction({ defaultTerms: values.defaultTerms, defaultValidityDays: days }),
          () => {
            setBaseline(values);
            setSaved(true);
          },
        );
      }}
    >
      <SettingsFrame
        section="terms"
        title="Condizioni e note"
        subtitle="Testo proposto in fondo a ogni nuovo preventivo e validità predefinita."
        canEdit={canEdit}
        dirty={dirty && !daysError}
        pending={pending}
        saved={saved}
        error={error}
      >
        <div className="form-grid narrow">
          <TextField
            label="Validità predefinita (giorni)"
            inputMode="numeric"
            value={values.defaultValidityDays}
            disabled={!canEdit}
            error={daysError}
            onChange={(event) => {
              setValues((current) => ({ ...current, defaultValidityDays: event.target.value.replace(/\D/g, "") }));
              setSaved(false);
            }}
          />
          <TextAreaField
            label="Condizioni predefinite"
            hint="Per esempio tempi di pagamento, cosa è escluso, validità dell'offerta. Puoi modificarle in ogni preventivo."
            rows={8}
            maxLength={4000}
            value={values.defaultTerms}
            disabled={!canEdit}
            onChange={(event) => {
              setValues((current) => ({ ...current, defaultTerms: event.target.value }));
              setSaved(false);
            }}
          />
          <p className="field-hint">{values.defaultTerms.length} / 4000 caratteri</p>
        </div>
      </SettingsFrame>
    </form>
  );
}
