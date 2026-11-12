/**
 * The visual templates. Keys are stable identifiers stored in quotes, versions and settings:
 * the four Phase 2 keys keep their ids (tpl_minimal, tpl_editorial, tpl_corporate, tpl_bold)
 * and now point to the closest premium redesign, so every existing quote keeps rendering.
 */
export const templateKeys = ["minimal", "studio", "editorial", "corporate", "bold"] as const;
export type TemplateKey = (typeof templateKeys)[number];

export function asTemplateKey(value: string | null | undefined): TemplateKey {
  return (templateKeys as readonly string[]).includes(value ?? "") ? (value as TemplateKey) : "minimal";
}

export const templateIdFor = (key: TemplateKey) => `tpl_${key}`;

export type PhotoSlot = "cover" | "interior";

export type PhotoOption = {
  id: string;
  label: string;
  /** Vector options are drawn by the template and recolour with the accent. */
  vector?: boolean;
  slots: PhotoSlot[];
};

export type TemplateInfo = {
  key: TemplateKey;
  name: string;
  /** Name shown before the redesign, kept for history and support. */
  legacyName: string | null;
  description: string;
  /** Accent of the reference mockup, used unless the quote asks for the Brand Kit or a custom colour. */
  accent: string;
  /** Palette dots shown in the gallery. */
  swatches: string[];
  /** What the template brings, for the gallery detail. */
  features: string[];
  photos: PhotoOption[];
};

export const templateInfo: Record<TemplateKey, TemplateInfo> = {
  minimal: {
    key: "minimal",
    name: "Swiss Minimal",
    legacyName: "Minimal",
    description: "Tipografico e silenzioso: griglia svizzera, sezioni numerate, un solo punto di colore.",
    accent: "#FF4D2E",
    swatches: ["#101010", "#929292", "#FF4D2E"],
    features: ["Titolo enorme e sezioni numerate da 01 a 08", "Tabelle senza riempimenti, solo righe sottili", "Timeline e firma tipografiche"],
    photos: [],
  },
  studio: {
    key: "studio",
    name: "Studio Editorial",
    legacyName: null,
    description: "Pulito e architettonico, con etichette maiuscole, box tenui e una grafica di copertina in pietra.",
    accent: "#A9C0D5",
    swatches: ["#202020", "#F1EFED", "#A9C0D5"],
    features: ["Copertina con grafica architettonica", "Etichette maiuscole spaziate e box tenui", "Riepilogo in due riquadri colorati"],
    photos: [
      { id: "archi", label: "Archi in pietra", slots: ["cover"] },
      { id: "blu", label: "Curve con blu", slots: ["cover"] },
      { id: "terracotta", label: "Curve terracotta", slots: ["cover"] },
      { id: "salvia", label: "Curve salvia", slots: ["cover"] },
    ],
  },
  editorial: {
    key: "editorial",
    name: "Editorial Atelier",
    legacyName: "Editorial",
    description: "Da rivista: serif elegante, fotografia mediterranea, citazione e grandi importi in terracotta.",
    accent: "#A75B3B",
    swatches: ["#F7F2EA", "#A75B3B", "#6B7046"],
    features: ["Foto a tutta pagina con titolo serif", "Capolettera, citazione e foto d'interni", "Importi grandi e firma su fascia oliva"],
    photos: [
      { id: "villa", label: "Villa e ulivo", slots: ["cover", "interior"] },
      { id: "arco", label: "Arco e scale", slots: ["cover", "interior"] },
      { id: "soggiorno", label: "Soggiorno", slots: ["cover", "interior"] },
      { id: "salotto", label: "Salotto", slots: ["cover", "interior"] },
    ],
  },
  corporate: {
    key: "corporate",
    name: "Corporate Executive",
    legacyName: "Corporate",
    description: "Autorevole: copertina blu notte con architettura, vantaggi, tabelle scure e grafico dei costi.",
    accent: "#FF7316",
    swatches: ["#10213D", "#FF7316", "#F3F5F7"],
    features: ["Copertina blu notte con architettura", "Vantaggi con icone e tabelle scure", "Grafico della ripartizione dei costi"],
    photos: [
      { id: "facciata", label: "Facciata al tramonto", slots: ["cover"] },
      { id: "ufficio", label: "Ufficio direzionale", slots: ["cover"] },
      { id: "boardroom", label: "Sala riunioni", slots: ["cover"] },
      { id: "architettura", label: "Ingresso", slots: ["cover"] },
    ],
  },
  bold: {
    key: "bold",
    name: "Bold Impact",
    legacyName: "Bold",
    description: "Nero e arancione ad alto contrasto: titolo enorme, arco grafico, importi giganti e grafico.",
    accent: "#FF541C",
    swatches: ["#101010", "#FF541C", "#FAF9F7"],
    features: ["Titolo gigante e arco vettoriale nel colore d'accento", "Fasce scure per riepilogo e condizioni", "Importi enormi e grafico dei costi"],
    photos: [
      { id: "arco", label: "Arco vettoriale", vector: true, slots: ["cover"] },
      { id: "aurora", label: "Aurora", slots: ["cover"] },
      { id: "eclissi", label: "Eclissi", slots: ["cover"] },
      { id: "orizzonte", label: "Orizzonte", slots: ["cover"] },
    ],
  },
};

/** Gallery and picker order. */
export const templateOrder: TemplateKey[] = [...templateKeys];

export function photoOptionFor(key: TemplateKey, requested: string | null | undefined): PhotoOption | null {
  const options = templateInfo[key].photos;
  return options.find((option) => option.id === requested) ?? options[0] ?? null;
}

/** Public URL of a shipped photo for the web renderer. */
export function photoUrl(key: TemplateKey, option: PhotoOption, slot: PhotoSlot | "thumb"): string | null {
  if (option.vector) return null;
  if (slot !== "thumb" && !option.slots.includes(slot)) return null;
  return `/templates/${key}/${option.id}-${slot}.webp`;
}
