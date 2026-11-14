"use client";

import { useState } from "react";
import { Eye, Hash } from "lucide-react";
import { SettingsFrame } from "@/components/settings/settings-frame";
import { useAction } from "@/components/data/use-action";
import { SelectField, TextField } from "@/components/ui/fields";
import { checkNumberFormat, formatQuoteNumber, numberFormatPresets } from "@/domain/numbering";
import { saveNumberingAction } from "@/server/actions/settings";

export function NumberingForm({
  format,
  numberReset,
  canEdit,
  year,
}: {
  format: string;
  numberReset: "yearly" | "never";
  canEdit: boolean;
  year: number;
}) {
  const initial = { format, numberReset };
  const [values, setValues] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useAction();
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
  const check = checkNumberFormat(values.format);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!check.ok) return;
        run(
          () => saveNumberingAction(values),
          () => {
            setBaseline(values);
            setSaved(true);
          },
        );
      }}
    >
      <SettingsFrame
        section="numbering"
        plain
        title="Numerazione preventivi"
        subtitle="Formato del codice assegnato a ogni preventivo pubblicato."
        canEdit={canEdit}
        dirty={dirty && check.ok}
        pending={pending}
        saved={saved}
        error={error}
      >
        <div className="ss-cols">
          <section className="card inset form-grid">
            <h2 className="section-heading">
              <Hash size={16} aria-hidden="true" /> Formato
            </h2>
          <TextField
            label="Formato"
            hint="Segnaposto: {YYYY} anno, {YY} anno breve, {0000} contatore con zeri iniziali."
            value={values.format}
            disabled={!canEdit}
            maxLength={40}
            error={check.ok ? undefined : check.message}
            onChange={(event) => {
              setValues((current) => ({ ...current, format: event.target.value }));
              setSaved(false);
            }}
          />
          <div className="preset-row" role="group" aria-label="Formati suggeriti">
            {numberFormatPresets.map((preset) => (
              <button
                key={preset}
                type="button"
                className="chip"
                disabled={!canEdit}
                aria-pressed={values.format === preset}
                onClick={() => {
                  setValues((current) => ({ ...current, format: preset }));
                  setSaved(false);
                }}
              >
                {preset}
              </button>
            ))}
          </div>
          <SelectField
            label="Azzera il contatore"
            value={values.numberReset}
            disabled={!canEdit}
            onChange={(event) => {
              setValues((current) => ({ ...current, numberReset: event.target.value === "never" ? "never" : "yearly" }));
              setSaved(false);
            }}
            options={[
              { value: "yearly", label: "Ogni anno, dal 1° gennaio" },
              { value: "never", label: "Mai, numerazione continua" },
            ]}
          />
          <p className="field-hint">
            Il numero viene assegnato in modo atomico solo quando un preventivo viene pubblicato, con il motore preventivi. Qui salvi la preferenza.
          </p>
          </section>
          <section className="card inset ss-number-card">
            <h2 className="section-heading">
              <Eye size={16} aria-hidden="true" /> Anteprima
            </h2>
            <div className="number-preview" aria-live="polite">
              <span className="muted small">Anteprima</span>
              <strong>{check.ok ? formatQuoteNumber(values.format, year, 1) : "Formato non valido"}</strong>
              {check.ok ? <span className="muted small">poi {formatQuoteNumber(values.format, year, 2)}, {formatQuoteNumber(values.format, year, 3)}</span> : null}
            </div>
            <p className="field-hint">
              {values.numberReset === "yearly" ? `Dal 1° gennaio ${year + 1} il contatore riparte da 1.` : "Il contatore non si azzera mai: la numerazione continua negli anni."}
            </p>
          </section>
        </div>
      </SettingsFrame>
    </form>
  );
}
