"use client";

import { useState } from "react";
import { SettingsFrame } from "@/components/settings/settings-frame";
import { Switch } from "@/components/data/controls";
import { useAction } from "@/components/data/use-action";
import { SelectField } from "@/components/ui/fields";
import { taxRateOptions } from "@/domain/catalog";
import type { PriceMode, TaxProfile } from "@/domain/pricing";
import { saveFiscalAction } from "@/server/actions/settings";
import type { WorkspaceSettings } from "@/server/settings";

export function FiscalForm({ taxProfile, settings, canEdit }: { taxProfile: TaxProfile; settings: WorkspaceSettings; canEdit: boolean }) {
  const initial = {
    taxProfile,
    defaultTaxRateBp: settings.defaultTaxRateBp,
    defaultPriceMode: settings.defaultPriceMode,
    stampDutyNote: settings.stampDutyNote,
  };
  const [values, setValues] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useAction();
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () => saveFiscalAction(values),
          () => {
            setBaseline(values);
            setSaved(true);
          },
        );
      }}
    >
      <SettingsFrame
        title="Fiscale e IVA"
        subtitle="Regime fiscale e valori proposti quando crei voci di catalogo e preventivi."
        canEdit={canEdit}
        dirty={dirty}
        pending={pending}
        saved={saved}
        error={error}
      >
        <div className="form-grid narrow">
          <SelectField
            label="Regime fiscale"
            value={values.taxProfile}
            disabled={!canEdit}
            onChange={(event) => set("taxProfile", event.target.value as TaxProfile)}
            options={[
              { value: "ordinario", label: "Ordinario, IVA applicata" },
              { value: "forfettario", label: "Forfettario, senza IVA" },
              { value: "estero", label: "Estero, senza IVA italiana" },
            ]}
          />
          {values.taxProfile === "forfettario" ? (
            <p className="field-hint">
              I preventivi mostreranno la dicitura del regime forfettario e nessuna IVA. Verifica sempre i casi particolari con il tuo commercialista.
            </p>
          ) : null}
          <div className="grid-2">
            <SelectField
              label="Aliquota IVA predefinita"
              value={String(values.defaultTaxRateBp)}
              disabled={!canEdit}
              onChange={(event) => set("defaultTaxRateBp", Number(event.target.value))}
              options={taxRateOptions.map((option) => ({ value: String(option.value), label: option.label }))}
            />
            <SelectField
              label="Prezzi inseriti"
              value={values.defaultPriceMode}
              disabled={!canEdit}
              onChange={(event) => set("defaultPriceMode", event.target.value as PriceMode)}
              options={[
                { value: "net", label: "IVA esclusa" },
                { value: "gross", label: "IVA inclusa" },
              ]}
            />
          </div>
          <Switch
            label="Nota sull'imposta di bollo"
            hint="Nel regime forfettario aggiunge la nota sul bollo da 2 € sopra 77,47 €."
            checked={values.stampDutyNote}
            disabled={!canEdit}
            onChange={(value) => set("stampDutyNote", value)}
          />
        </div>
      </SettingsFrame>
    </form>
  );
}
