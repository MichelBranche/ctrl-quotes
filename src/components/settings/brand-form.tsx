"use client";

import { useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { Building2, ImageUp, Palette, Trash2, Type } from "lucide-react";
import { SettingsFrame } from "@/components/settings/settings-frame";
import { SectionTitle, Switch } from "@/components/data/controls";
import { useAction } from "@/components/data/use-action";
import { TemplateCover } from "@/components/templates/template-cover";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/fields";
import { brandFonts, contrastRatio, fontStack, logoLimits, readableOn, type BrandFont } from "@/domain/brand";
import { removeLogoAction, saveBrandAction, uploadLogoAction } from "@/server/actions/settings";
import type { BrandKit } from "@/server/settings";
import type { TemplateKey } from "@/server/templates";

type ColorKey = "colorPrimary" | "colorSecondary" | "colorBackground";

const colorLabels: Record<ColorKey, string> = {
  colorPrimary: "Primario",
  colorSecondary: "Secondario",
  colorBackground: "Sfondo",
};

export function BrandKitForm({
  brand,
  workspaceName,
  canEdit,
  templateKey,
  templateName,
}: {
  brand: BrandKit;
  workspaceName: string;
  canEdit: boolean;
  templateKey: TemplateKey;
  templateName: string;
}) {
  const initial = {
    companyName: brand.companyName ?? "",
    vatNumber: brand.vatNumber ?? "",
    taxCode: brand.taxCode ?? "",
    address: brand.address ?? "",
    email: brand.email ?? "",
    phone: brand.phone ?? "",
    website: brand.website ?? "",
    colorPrimary: brand.colorPrimary,
    colorSecondary: brand.colorSecondary,
    colorBackground: brand.colorBackground,
    fontHeading: brand.fontHeading,
    fontBody: brand.fontBody,
    applyAutomatically: brand.applyAutomatically,
  };
  const [values, setValues] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [openColor, setOpenColor] = useState<ColorKey | null>(null);
  const { pending, error, run } = useAction();
  const logo = useAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
  const logoUrl = brand.logo ? `/api/assets/${brand.logo.assetId}?v=${brand.logo.updatedAt}` : null;

  function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function uploadFile(file: File | undefined) {
    if (!file) return;
    if (!(logoLimits.mimes as readonly string[]).includes(file.type)) {
      logo.setError("Formato non supportato. Usa PNG, JPG o SVG.");
      return;
    }
    if (file.size > logoLimits.maxBytes) {
      logo.setError("Il logo supera 1 MB. Riducilo e riprova.");
      return;
    }
    const data = new FormData();
    data.set("logo", file);
    logo.run(() => uploadLogoAction(data));
    if (fileRef.current) fileRef.current.value = "";
  }

  const accentContrast = contrastRatio(readableOn(values.colorSecondary), values.colorSecondary);
  const textContrast = contrastRatio(values.colorPrimary, values.colorBackground);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () => saveBrandAction(values),
          () => {
            setBaseline(values);
            setSaved(true);
          },
        );
      }}
    >
      <SettingsFrame
        title="Brand Kit"
        subtitle="Logo, colori, tipografia e dati aziendali usati nei preventivi."
        canEdit={canEdit}
        dirty={dirty}
        pending={pending}
        saved={saved}
        error={error}
      >
        <div className="brand-grid">
          <div className="stack-tight">
            <section className="card inset">
              <SectionTitle icon={<ImageUp size={16} aria-hidden="true" />}>Logo</SectionTitle>
              <div
                className="logo-row"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (canEdit) uploadFile(event.dataTransfer.files[0]);
                }}
              >
                <div className="logo-box">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt={`Logo di ${values.companyName || workspaceName}`} />
                  ) : (
                    <span className="muted small">Nessun logo</span>
                  )}
                </div>
                <div className="stack-tight">
                  <label className={`btn btn-secondary${!canEdit || logo.pending ? " is-disabled" : ""}`}>
                    <ImageUp size={16} aria-hidden="true" /> {logo.pending ? "Caricamento…" : brand.logo ? "Sostituisci logo" : "Carica logo"}
                    <input
                      ref={fileRef}
                      className="visually-hidden"
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml"
                      disabled={!canEdit || logo.pending}
                      onChange={(event) => uploadFile(event.target.files?.[0])}
                    />
                  </label>
                  <Button variant="secondary" disabled={!canEdit || !brand.logo || logo.pending} onClick={() => logo.run(() => removeLogoAction())}>
                    <Trash2 size={16} aria-hidden="true" /> Rimuovi
                  </Button>
                </div>
              </div>
              <p className="field-hint">PNG, SVG o JPG, massimo 1 MB. Il file resta nel database del workspace.</p>
              {logo.error ? (
                <p className="field-error" role="alert">
                  {logo.error}
                </p>
              ) : null}
            </section>

            <section className="card inset">
              <SectionTitle icon={<Palette size={16} aria-hidden="true" />}>Colori del brand</SectionTitle>
              <div className="swatch-row">
                {(Object.keys(colorLabels) as ColorKey[]).map((key) => (
                  <div key={key} className="swatch-field">
                    <button
                      type="button"
                      className="swatch"
                      style={{ background: values[key], color: readableOn(values[key]) }}
                      aria-label={`${colorLabels[key]}: ${values[key]}. Apri il selettore`}
                      aria-expanded={openColor === key}
                      disabled={!canEdit}
                      onClick={() => setOpenColor(openColor === key ? null : key)}
                    >
                      Aa
                    </button>
                    <label htmlFor={`hex-${key}`} className="small">
                      {colorLabels[key]}
                    </label>
                    <input
                      id={`hex-${key}`}
                      className="hex-input"
                      value={values[key]}
                      maxLength={7}
                      disabled={!canEdit}
                      onChange={(event) => set(key, event.target.value.startsWith("#") ? event.target.value : `#${event.target.value}`)}
                    />
                  </div>
                ))}
              </div>
              {openColor && canEdit ? (
                <div className="picker-pop">
                  <HexColorPicker color={values[openColor]} onChange={(color) => set(openColor, color.toUpperCase())} />
                  <Button variant="secondary" onClick={() => setOpenColor(null)}>
                    Fatto
                  </Button>
                </div>
              ) : null}
              <p className="field-hint">
                Contrasto testo su sfondo: {textContrast.toFixed(1)}:1{textContrast < 4.5 ? ", basso per i testi lunghi" : ", buono"}. Testo sul
                secondario: {accentContrast.toFixed(1)}:1{accentContrast < 4.5 ? ", basso" : ", buono"}.
              </p>
            </section>

            <section className="card inset">
              <SectionTitle icon={<Type size={16} aria-hidden="true" />}>Tipografia</SectionTitle>
              <div className="grid-2">
                <SelectField
                  label="Titoli"
                  value={values.fontHeading}
                  disabled={!canEdit}
                  onChange={(event) => set("fontHeading", event.target.value as BrandFont)}
                  options={brandFonts.map((font) => ({ value: font, label: font }))}
                />
                <SelectField
                  label="Testo"
                  value={values.fontBody}
                  disabled={!canEdit}
                  onChange={(event) => set("fontBody", event.target.value as BrandFont)}
                  options={brandFonts.map((font) => ({ value: font, label: font }))}
                />
              </div>
            </section>
          </div>

          <section className="card inset brand-preview" aria-label="Anteprima">
            <SectionTitle>Anteprima con {templateName}</SectionTitle>
            <div
              className="brand-preview-frame"
              style={
                {
                  "--brand-primary": values.colorPrimary,
                  "--brand-secondary": values.colorSecondary,
                  "--brand-bg": values.colorBackground,
                  "--brand-heading": fontStack[values.fontHeading],
                  "--brand-body": fontStack[values.fontBody],
                } as React.CSSProperties
              }
            >
              <TemplateCover templateKey={templateKey} name="Proposta di progetto" brandName={values.companyName || workspaceName} logoUrl={logoUrl} large />
              <div className="brand-sample">
                <strong>Riepilogo</strong>
                <span>Totale una tantum</span>
                <span className="brand-chip">Accetta proposta</span>
              </div>
            </div>
            <p className="field-hint">Anteprima indicativa. Il rendering completo arriva con l&apos;editor dei preventivi.</p>
          </section>
        </div>

        <section className="card inset">
          <SectionTitle icon={<Building2 size={16} aria-hidden="true" />}>Dati aziendali</SectionTitle>
          <p className="field-hint">Compaiono nell&apos;intestazione dei preventivi. Inserisci solo dati reali della tua attività.</p>
          <div className="form-grid">
            <div className="grid-2">
              <TextField label="Nome azienda" value={values.companyName} disabled={!canEdit} maxLength={120} placeholder={workspaceName} onChange={(event) => set("companyName", event.target.value)} />
              <TextField label="Partita IVA" value={values.vatNumber} disabled={!canEdit} maxLength={20} onChange={(event) => set("vatNumber", event.target.value)} />
            </div>
            <div className="grid-2">
              <TextField label="Codice fiscale" value={values.taxCode} disabled={!canEdit} maxLength={20} onChange={(event) => set("taxCode", event.target.value)} />
              <TextField label="Indirizzo" value={values.address} disabled={!canEdit} maxLength={200} onChange={(event) => set("address", event.target.value)} />
            </div>
            <div className="grid-3">
              <TextField label="Email" type="email" value={values.email} disabled={!canEdit} onChange={(event) => set("email", event.target.value)} />
              <TextField label="Telefono" type="tel" value={values.phone} disabled={!canEdit} onChange={(event) => set("phone", event.target.value)} />
              <TextField label="Sito web" value={values.website} disabled={!canEdit} onChange={(event) => set("website", event.target.value)} />
            </div>
          </div>
        </section>

        <section className="card inset">
          <Switch
            label="Applica automaticamente"
            hint="Usa questo Brand Kit per tutti i nuovi preventivi."
            checked={values.applyAutomatically}
            disabled={!canEdit}
            onChange={(value) => set("applyAutomatically", value)}
          />
        </section>
      </SettingsFrame>
    </form>
  );
}
