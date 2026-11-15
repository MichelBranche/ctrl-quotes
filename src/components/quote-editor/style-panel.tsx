"use client";

import { useId } from "react";
import Link from "next/link";
import { Check, ImageIcon } from "lucide-react";
import { TemplateCover } from "@/components/templates/template-cover";
import { contrastRatio } from "@/domain/brand";
import type { DocumentStyle, QuoteDocument } from "@/domain/quote-document";
import { photoOptionFor, photoUrl, templateInfo, type TemplateKey } from "@/domain/templates";
import type { TemplateRow } from "@/server/templates";
import { cn } from "@/lib/cn";

const hex = /^#[0-9A-Fa-f]{6}$/;

/** Template, cover photo and accent: presentation only, the content never changes. */
export function StylePanel({
  templates,
  templateId,
  templateKey,
  document,
  brandName,
  brandAccent,
  logoUrl,
  readOnly,
  onTemplate,
  onStyle,
  embedded = false,
  onOpenDetails,
  brandFonts,
}: {
  templates: TemplateRow[];
  templateId: string;
  templateKey: TemplateKey;
  document: QuoteDocument;
  brandName: string;
  brandAccent: string;
  logoUrl: string | null;
  readOnly: boolean;
  onTemplate: (templateId: string) => void;
  onStyle: (style: DocumentStyle) => void;
  /** Inside the visual editor's side panel: no card, a "whole document" heading. */
  embedded?: boolean;
  /** Embedded only: the template is chosen in the Dettagli tab, not in Stile. */
  onOpenDetails?: () => void;
  /** Brand Kit fonts ("template" or a font ref), shown as document settings when embedded. */
  brandFonts?: { heading: string; body: string };
}) {
  const titleId = useId();
  const style = document.style;
  const info = templateInfo[templateKey];
  const chosen = photoOptionFor(templateKey, style.photos[templateKey]);
  const cover = document.blocks.find((block) => block.type === "cover");
  const uploaded = cover?.type === "cover" && cover.imageAssetId;
  const custom = style.accent !== "template" && style.accent !== "brand" ? style.accent : null;
  const accent = style.accent === "template" ? info.accent : style.accent === "brand" ? brandAccent : style.accent;
  const contrast = hex.test(accent) ? contrastRatio(accent, "#FFFFFF") : 21;
  const setAccent = (value: DocumentStyle["accent"]) => onStyle({ ...style, accent: value });
  const templateGrid = (
      <div className="style-grid" role="radiogroup" aria-label="Template">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            role="radio"
            aria-checked={template.id === templateId}
            className={cn("style-option", template.id === templateId && "is-selected")}
            onClick={() => onTemplate(template.id)}
            disabled={readOnly}
          >
            <TemplateCover templateKey={template.key} brandName={brandName} logoUrl={logoUrl} photo={style.photos[template.key] ?? null} accent={custom ?? (style.accent === "brand" ? brandAccent : null)} />
            <span className="style-option-name">
              {template.id === templateId ? <Check size={13} aria-hidden="true" /> : null}
              {template.name}
            </span>
          </button>
        ))}
      </div>
  );

  return (
    <section className={embedded ? "style-panel is-embedded" : "card editor-panel style-panel"} aria-labelledby={titleId}>
      {embedded ? (
        <h2 id={titleId} className="visually-hidden">
          Tutto il documento
        </h2>
      ) : (
      <div className="panel-head">
        <div>
          <h2 id={titleId}>Stile del preventivo</h2>
          <p className="muted small">Cambia l&apos;impaginazione senza toccare i contenuti.</p>
        </div>
      </div>
      )}

      {embedded ? (
        <dl className="doc-facts">
          <div>
            <dt>Formato</dt>
            <dd>A4 verticale, uguale nel link e nel PDF</dd>
          </div>
          <div>
            <dt>Template</dt>
            <dd>
              {templates.find((template) => template.id === templateId)?.name ?? info.name}
              {onOpenDetails ? (
                <>
                  {" "}
                  <button type="button" className="link-btn" onClick={onOpenDetails}>
                    Cambia in Dettagli
                  </button>
                </>
              ) : null}
            </dd>
          </div>
        </dl>
      ) : (
        templateGrid
      )}
      {info.photos.length ? (
        <fieldset className="style-field" disabled={readOnly}>
          <legend>Immagine di copertina</legend>
          {uploaded ? <p className="muted small">Stai usando la foto caricata nel blocco Copertina: rimuovila lì per tornare a queste.</p> : null}
          <div className="photo-grid" role="radiogroup" aria-label="Immagine di copertina">
            {info.photos.map((option) => {
              const thumb = photoUrl(templateKey, option, "thumb");
              const active = chosen?.id === option.id && !uploaded;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={cn("photo-option", active && "is-selected")}
                  onClick={() => onStyle({ ...style, photos: { ...style.photos, [templateKey]: option.id } })}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <ArcSwatch accent={accent} />
                  )}
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <p className="muted small style-note">
          <ImageIcon size={14} aria-hidden="true" /> {info.name} è solo tipografico: nessuna foto in copertina.
        </p>
      )}

      <fieldset className="style-field" disabled={readOnly}>
        <legend>Colore d&apos;accento</legend>
        <div className="accent-options" role="radiogroup" aria-label="Colore d'accento">
          <AccentChoice label="Del template" color={info.accent} active={style.accent === "template"} onClick={() => setAccent("template")} />
          <AccentChoice label="Brand Kit" color={brandAccent} active={style.accent === "brand"} onClick={() => setAccent("brand")} />
          <label className={cn("accent-choice", custom && "is-selected")}>
            <input
              type="color"
              aria-label="Colore personalizzato"
              value={custom ?? info.accent}
              onChange={(event) => setAccent(event.target.value.toUpperCase())}
            />
            <span>Personalizzato</span>
          </label>
        </div>
        {contrast < 3 ? (
          <p className="field-hint" role="status">
            Colore chiaro: su fondo bianco i testi piccoli in accento vengono scuriti in automatico per restare leggibili (contrasto {contrast.toFixed(1)}:1).
          </p>
        ) : null}
      </fieldset>
      {embedded && brandFonts ? (
        <div className="style-field">
          <p className="style-legend">Tipografia</p>
          <dl className="doc-facts">
            <div>
              <dt>Titoli</dt>
              <dd>{fontLabel(brandFonts.heading)}</dd>
            </div>
            <div>
              <dt>Testo</dt>
              <dd>{fontLabel(brandFonts.body)}</dd>
            </div>
          </dl>
          <p className="muted small">Si cambiano per tutti i preventivi nel <Link href="/app/settings/brand">Brand Kit</Link>; per un solo testo usa Stile sul blocco.</p>
        </div>
      ) : null}
      <p className="muted small">
        Logo e dati aziendali arrivano dal <Link href="/app/settings/brand">Brand Kit</Link>.
      </p>
    </section>
  );
}

function AccentChoice({ label, color, active, onClick }: { label: string; color: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={active} className={cn("accent-choice", active && "is-selected")} onClick={onClick}>
      <i style={{ background: color }} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

/** Thumbnail of the vector arc, in the current accent. */
function ArcSwatch({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 64 44" aria-hidden="true" className="photo-vector">
      <defs>
        <radialGradient id="arc-swatch" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.7" stopColor="#101010" />
          <stop offset="0.95" stopColor={accent} stopOpacity="0.85" />
          <stop offset="1" stopColor={accent} />
        </radialGradient>
      </defs>
      <rect width="64" height="44" fill="#101010" />
      <circle cx="64" cy="64" r="52" fill="url(#arc-swatch)" />
    </svg>
  );
}

/** "g:Playfair Display" -> "Playfair Display", "fs:general-sans" -> "General Sans". */
function fontLabel(value: string) {
  if (value.startsWith("g:")) return value.slice(2);
  if (value.startsWith("fs:")) return value.slice(3).split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  return "Del template";
}
