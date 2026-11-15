"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { blockTextFields, getField, type FieldPath } from "@/domain/document-ops";
import type { FontRef } from "@/domain/fonts";
import type { QuoteBlock } from "@/domain/quote-document";
import type { BlockLook, TextFormat } from "@/domain/text-format";
import { cn } from "@/lib/cn";
import { FontSelect } from "../text/font-select";
import { useTextStyles } from "../text/text-styles-context";
import { matchingStyle, stylePatch, textStyleKeys, textStyleLabel } from "@/domain/text-styles";

/**
 * "Stile" tab for the selected block: the type of one of its texts and the look of the block on
 * the page. The floating toolbar does quick edits while typing; this is the full set.
 */

const weights = [
  [300, "Light"],
  [400, "Regular"],
  [500, "Medium"],
  [600, "Semibold"],
  [700, "Bold"],
  [800, "Extra bold"],
  [900, "Black"],
] as const;
const aligns = [
  ["left", "Sinistra"],
  ["center", "Centro"],
  ["right", "Destra"],
  ["justify", "Giustificato"],
] as const;

function Slider({ label, value, min, max, step, unit, placeholder, onChange }: { label: string; value: number | undefined; min: number; max: number; step: number; unit: string; placeholder: string; onChange: (value: number | undefined, live: boolean) => void }) {
  return (
    <label className="bs-slider">
      <span>
        {label}
        <b>{value === undefined ? placeholder : `${String(Math.round(value * 100) / 100).replace(".", ",")}${unit}`}</b>
      </span>
      <span className="bs-slider-row">
        <input type="range" min={min} max={max} step={step} value={value ?? min} onChange={(event) => onChange(Number(event.target.value), true)} />
        {value !== undefined ? (
          <button type="button" className="icon-btn bs-mini" aria-label={`${label}: torna al template`} title="Torna al template" onClick={() => onChange(undefined, false)}>
            <RotateCcw size={12} aria-hidden="true" />
          </button>
        ) : null}
      </span>
    </label>
  );
}

function ColorInput({ label, value, swatches, onChange }: { label: string; value: string | undefined; swatches: string[]; onChange: (value: string | undefined) => void }) {
  return (
    <div className="bs-color">
      <span className="bs-label">{label}</span>
      <div className="bs-swatches">
        <button type="button" className={cn("bs-swatch is-none", !value && "is-on")} aria-label={`${label}: del template`} title="Del template" onClick={() => onChange(undefined)} />
        {swatches.map((color) => (
          <button key={color} type="button" className={cn("bs-swatch", value?.toUpperCase() === color.toUpperCase() && "is-on")} style={{ background: color }} aria-label={`${label} ${color}`} title={color} onClick={() => onChange(color.toUpperCase())} />
        ))}
        <label className="bs-swatch is-custom" title="Colore personalizzato">
          <input type="color" aria-label={`${label}: colore personalizzato`} value={value ?? "#7C3AED"} onChange={(event) => onChange(event.target.value.toUpperCase())} />
        </label>
      </div>
    </div>
  );
}

export function BlockStyle({
  block,
  focusField,
  recentField = null,
  fieldName,
  readOnly,
  brandColors,
  brandFonts,
  widthLabel,
  onFormat,
  onLook,
  onReset,
}: {
  block: QuoteBlock;
  /** The text being edited on the sheet, if any: the panel styles that one. */
  focusField: FieldPath | null;
  /** The text last edited in this block, styled when nothing else is chosen. */
  recentField?: FieldPath | null;
  fieldName: (field: string) => string;
  readOnly: boolean;
  brandColors: string[];
  brandFonts: Array<{ ref: FontRef; role: string }>;
  widthLabel: string;
  onFormat: (field: FieldPath, format: TextFormat | null, live?: boolean) => void;
  onLook: (look: BlockLook | null, live?: boolean) => void;
  onReset: () => void;
}) {
  const fields = blockTextFields.filter((field) => typeof getField(block, field) === "string") as FieldPath[];
  const [picked, setPicked] = useState<FieldPath | null>(null);
  const known = (candidate: FieldPath | null): candidate is FieldPath => Boolean(candidate && (fields.includes(candidate) || typeof getField(block, candidate) === "string"));
  const field = known(focusField) ? focusField : known(picked) ? picked : known(recentField) ? recentField : (fields[0] ?? null);
  const chips = field && !fields.includes(field) ? [...fields, field] : fields;
  const format: TextFormat = (field && block.fmt?.[field]) || {};
  const look: BlockLook = block.look ?? {};
  const textStyles = useTextStyles();
  const savedStyle = matchingStyle(textStyles.styles, format);
  const patch = (next: Partial<TextFormat>, live = false) => {
    if (!field) return;
    const merged = { ...format, ...next } as Record<string, unknown>;
    for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
    onFormat(field, merged as TextFormat, live);
  };
  const setLook = (next: Partial<BlockLook>, live = false) => {
    const merged = { ...look, ...next } as Record<string, unknown>;
    for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
    onLook(merged as BlockLook, live);
  };
  const styled = Boolean(block.look) || Boolean(block.fmt && Object.keys(block.fmt).length);
  const swatches = [...new Set([...brandColors, "#0B0B0F", "#6E6E73", "#FFFFFF", "#F5F5F7", "#F4F2FF", "#7C3AED", "#16A34A", "#DC2626"].map((color) => color.toUpperCase()))];

  return (
    <fieldset className="bs" disabled={readOnly || Boolean(block.locked)}>
      <legend className="visually-hidden">Stile del blocco</legend>
      {field ? (
        <section className="ve-panel-section" aria-labelledby="bs-text">
          <h3 id="bs-text">Testo</h3>
          {chips.length > 1 ? (
            <div className="bs-fields" role="radiogroup" aria-label="Testo da modificare">
              {chips.map((item) => (
                <button key={item} type="button" role="radio" aria-checked={item === field} className={cn("bs-chip", item === field && "is-on", block.fmt?.[item] && "has-style")} onClick={() => setPicked(item)}>
                  {fieldName(item)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="bs-styles" role="group" aria-label="Stili di testo del workspace">
            <span className="bs-label">Stile salvato</span>
            <div className="bs-fields">
              {textStyleKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={cn("bs-chip", savedStyle === key && "is-on")}
                  aria-pressed={savedStyle === key}
                  title={`Applica ${textStyleLabel[key]}: uguale nel link e nel PDF`}
                  onClick={() => patch(stylePatch(textStyles.styles[key]))}
                >
                  {textStyleLabel[key]}
                </button>
              ))}
            </div>
          </div>
          <FontSelect label="Font" value={(format.font as FontRef | undefined) ?? null} brand={brandFonts} onChange={(ref) => patch({ font: ref ?? undefined })} emptyLabel="Del template o del Brand Kit" />
          <div className="bs-grid">
            <label className="bs-field">
              <span className="bs-label">Dimensione (pt)</span>
              <input
                type="number"
                min={4}
                max={200}
                step={0.5}
                placeholder="Template"
                key={`${field}:${format.size ?? ""}`}
                defaultValue={format.size ?? ""}
                onBlur={(event) => patch({ size: event.target.value ? Math.max(4, Math.min(200, Number(event.target.value))) : undefined })}
                onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              />
            </label>
            <label className="bs-field">
              <span className="bs-label">Peso</span>
              <select value={format.weight ?? (format.bold === undefined ? "" : format.bold ? 700 : 400)} onChange={(event) => patch({ weight: event.target.value ? Number(event.target.value) : undefined, bold: undefined })}>
                <option value="">Del template</option>
                {weights.map(([value, name]) => (
                  <option key={value} value={value}>
                    {`${value} ${name}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ColorInput label="Colore" value={format.color} swatches={swatches} onChange={(color) => patch({ color })} />
          <div className="bs-field">
            <span className="bs-label">Allineamento</span>
            <div className="segmented bs-seg" role="radiogroup" aria-label="Allineamento">
              {aligns.map(([value, name]) => (
                <button key={value} type="button" role="radio" aria-checked={format.align === value} className={cn(format.align === value && "is-active")} onClick={() => patch({ align: format.align === value ? undefined : value })}>
                  {name}
                </button>
              ))}
            </div>
          </div>
          <Slider label="Interlinea" value={format.lineHeight} min={0.8} max={2.4} step={0.05} unit="" placeholder="Template" onChange={(value, live) => patch({ lineHeight: value }, live)} />
          <Slider label="Spaziatura lettere" value={format.tracking === undefined ? undefined : Math.round(format.tracking * 1000)} min={-50} max={400} step={5} unit="" placeholder="Template" onChange={(value, live) => patch({ tracking: value === undefined ? undefined : value / 1000 }, live)} />
          <label className="ve-switch">
            <input type="checkbox" role="switch" checked={format.case === "upper"} onChange={() => patch({ case: format.case === "upper" ? undefined : "upper" })} />
            <span className="ve-switch-track" aria-hidden="true" />
            <span>Tutto maiuscolo</span>
          </label>
          {block.fmt?.[field] ? (
            <button type="button" className="link-btn" onClick={() => onFormat(field, null)}>
              Togli lo stile da {fieldName(field).toLowerCase()}
            </button>
          ) : null}
        </section>
      ) : null}

      <section className="ve-panel-section" aria-labelledby="bs-box">
        <h3 id="bs-box">Blocco nella pagina</h3>
        <p className="muted small">Larghezza: {widthLabel}. Per affiancare o cambiare colonne usa la barra sopra il blocco.</p>
        <Slider label="Spazio sopra" value={look.mt} min={0} max={80} step={2} unit=" pt" placeholder="Template" onChange={(value, live) => setLook({ mt: value }, live)} />
        <Slider label="Spazio sotto" value={look.mb} min={0} max={80} step={2} unit=" pt" placeholder="Template" onChange={(value, live) => setLook({ mb: value }, live)} />
        <Slider label="Margine interno" value={look.pad} min={0} max={40} step={2} unit=" pt" placeholder="Template" onChange={(value, live) => setLook({ pad: value }, live)} />
        <ColorInput label="Sfondo" value={look.bg} swatches={swatches} onChange={(bg) => setLook({ bg })} />
        <ColorInput label="Bordo" value={look.border} swatches={swatches} onChange={(border) => setLook({ border, borderWidth: border ? (look.borderWidth ?? 1) : undefined })} />
        {look.border ? <Slider label="Spessore bordo" value={look.borderWidth ?? 1} min={0} max={6} step={0.5} unit=" pt" placeholder="1 pt" onChange={(value, live) => setLook({ borderWidth: value }, live)} /> : null}
        <Slider label="Angoli arrotondati" value={look.radius} min={0} max={24} step={1} unit=" pt" placeholder="Template" onChange={(value, live) => setLook({ radius: value }, live)} />
      </section>

      <button type="button" className="btn btn-secondary btn-sm bs-reset" disabled={!styled} onClick={onReset}>
        <RotateCcw size={14} aria-hidden="true" /> Ripristina dal template
      </button>
    </fieldset>
  );
}
