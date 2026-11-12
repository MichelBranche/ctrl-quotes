import type { TemplateKey } from "@/server/templates";
import { cn } from "@/lib/cn";

export const templateMeta: Record<TemplateKey, { tagline: string; swatches: string[]; features: string[] }> = {
  minimal: {
    tagline: "Pulito, essenziale e professionale.",
    swatches: ["#8C8C8C", "#E5E2DD", "#F4F2EE"],
    features: ["Copertina sobria con molto spazio bianco", "Servizi in elenco semplice", "Adatto a qualsiasi settore"],
  },
  editorial: {
    tagline: "Elegante e curato nei dettagli.",
    swatches: ["#E8DCCB", "#8A5A2B", "#C9A27A"],
    features: ["Titoli serif di grande formato", "Impaginazione a colonne da rivista", "Ideale per studi creativi"],
  },
  corporate: {
    tagline: "Strutturato, affidabile e istituzionale.",
    swatches: ["#1F3A68", "#2B4C8C", "#C9D3E6"],
    features: ["Intestazione formale con dati aziendali", "Tabelle prezzi dettagliate", "Pensato per aziende e team"],
  },
  bold: {
    tagline: "Deciso, dinamico e d'impatto.",
    swatches: ["#0B0B0F", "#FF6A13", "#FFFFFF"],
    features: ["Forte contrasto e colore d'accento", "Numeri e totali in evidenza", "Per proposte che si fanno notare"],
  },
};

/** Static cover sketch. The full renderer arrives with the quote engine. */
export function TemplateCover({
  templateKey,
  name,
  brandName,
  logoUrl,
  large = false,
}: {
  templateKey: TemplateKey;
  name: string;
  brandName: string;
  logoUrl?: string | null;
  large?: boolean;
}) {
  return (
    <div className={cn("tpl-cover", `tpl-${templateKey}`, large && "is-large")} aria-hidden="true">
      <div className="tpl-brand">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" />
        ) : (
          <span>{brandName}</span>
        )}
      </div>
      <small>Proposta commerciale</small>
      <strong>{name}</strong>
      <p>{templateMeta[templateKey].tagline}</p>
      <i className="tpl-shape" />
      {large ? (
        <div className="tpl-lines">
          <span />
          <span />
          <span />
        </div>
      ) : null}
    </div>
  );
}
