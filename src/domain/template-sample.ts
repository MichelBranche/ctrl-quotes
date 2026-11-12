import { computeTotals, documentSchema, type QuoteDocument, type QuoteLine } from "@/domain/quote-document";
import type { QuoteSnapshot } from "@/domain/quote-snapshot";
import type { TemplateKey } from "@/domain/templates";

/**
 * Sample content of the five reference mockups ("Studio Esempio", "Cliente Esempio").
 * Clearly fictitious placeholder data: used for gallery thumbnails (with the user's own brand name
 * and logo on top) and for the render tests. Never saved into a real quote.
 */

let seq = 0;
const id = (prefix: string) => `${prefix}${(seq += 1)}`;

function line(name: string, description: string, euros: number, billing: QuoteLine["billing"] = "una_tantum"): QuoteLine {
  return {
    id: id("l"),
    catalogItemId: null,
    name,
    description,
    unit: "",
    quantityMilli: 1000,
    unitPriceCents: euros * 100,
    priceMode: "net",
    taxRateBp: 2200,
    taxNature: null,
    discountBp: 0,
    billing,
    periods: null,
  };
}

export const demoServices = () => [
  line("Analisi e strategia", "Analisi requisiti, benchmark e definizione struttura.", 800),
  line("UX/UI Design", "Progettazione esperienza utente e interfacce (wireframe e mockup).", 1500),
  line("Sviluppo sito web", "Sviluppo responsive (fino a 10 pagine), CMS (WordPress) e funzionalità principali.", 3200),
  line("Contenuti di base", "Impostazione contenuti (testi e immagini forniti dal cliente) e ottimizzazione SEO base.", 600),
  line("Go live e formazione", "Pubblicazione, test finali e sessione di formazione all'uso del CMS.", 400),
  line("Manutenzione e assistenza", "Aggiornamenti, backup e assistenza.", 150, "mensile"),
];

const highlights: Record<TemplateKey, Array<{ icon: "visibility" | "contacts" | "value" | "performance" | "control" | "results"; title: string; body: string }>> = {
  minimal: [],
  studio: [],
  editorial: [],
  corporate: [
    { icon: "visibility", title: "+ Visibilità", body: "Presenza online più efficace e orientata ai risultati." },
    { icon: "contacts", title: "+ Contatti", body: "Percorsi chiari e conversioni più alte." },
    { icon: "value", title: "+ Valore", body: "Un'esperienza coerente con l'identità del brand." },
  ],
  bold: [
    { icon: "performance", title: "Più performance", body: "Un sito veloce, stabile e scalabile." },
    { icon: "control", title: "Più controllo", body: "Contenuti semplici da gestire in autonomia." },
    { icon: "results", title: "Più risultati", body: "Un'esperienza chiara che genera contatti." },
  ],
};

const leads: Record<TemplateKey, string> = {
  minimal: "",
  studio: "",
  editorial: "Un nuovo sito web per valorizzare la vostra identità.",
  corporate: "",
  bold: "Un nuovo sito web per far crescere il vostro business.",
};

const bodies: Record<TemplateKey, string> = {
  minimal:
    "Progettazione e realizzazione del nuovo sito web di Cliente Esempio, con l'obiettivo di migliorare la presenza online, la comunicazione del brand e la generazione di nuove opportunità di contatto.",
  studio:
    "Proponiamo la progettazione e realizzazione di un nuovo sito web per Cliente Esempio, pensato per rafforzare la presenza online, comunicare in modo efficace i servizi e generare nuove opportunità di contatto.",
  editorial:
    "Progettiamo e realizziamo un sito web moderno, veloce e orientato ai vostri obiettivi di business, con un design curato e un'esperienza utente chiara ed efficace.",
  corporate:
    "Proponiamo la progettazione e realizzazione del nuovo sito web di Cliente Esempio, con l'obiettivo di rafforzare la presenza online, migliorare la comunicazione del brand e generare nuove opportunità di contatto e business.",
  bold: "Progettiamo e realizziamo un sito web moderno, veloce e orientato ai vostri obiettivi di comunicazione, acquisizione e crescita del business.",
};

const taglines: Record<TemplateKey, string> = {
  minimal: "Agenzia Digitale\nDesign / Sviluppo / Strategia",
  studio: "Web Design /\nSviluppo /\nStrategia Digitale",
  editorial: "",
  corporate: "Progettazione, sviluppo e lancio\ndel nuovo sito web aziendale.",
  bold: "",
};

export function demoDocument(template: TemplateKey, overrides: { services?: QuoteLine[]; title?: string } = {}): QuoteDocument {
  // Deterministic ids, so server and browser renders of a thumbnail match.
  if (!overrides.services) seq = 0;
  const raw = {
    withholdingBp: 0,
    style: { accent: "template", photos: {} },
    blocks: [
      { id: "b-cover", type: "cover", title: overrides.title ?? "Nuovo Sito Web", subtitle: "Proposta per Cliente Esempio", tagline: taglines[template], project: template === "bold" || template === "corporate" ? "Sito web aziendale" : "Sviluppo sito web" },
      {
        id: "b-intro",
        type: "intro",
        heading: "Il progetto",
        lead: leads[template],
        body: bodies[template],
        quote: template === "editorial" ? "Uno strumento digitale che racconta chi siete e genera nuove opportunità." : "",
        points:
          template === "studio"
            ? ["valorizzare l'identità e il posizionamento del brand", "offrire un'esperienza di navigazione moderna e intuitiva", "aumentare le richieste di contatto e le opportunità commerciali"]
            : [],
      },
      { id: "b-high", type: "highlights", heading: "Vantaggi", items: highlights[template].map((item) => ({ ...item, id: id("h") })) },
      { id: "b-services", type: "services", heading: "Servizi inclusi", items: overrides.services ?? demoServices() },
      {
        id: "b-options",
        type: "options",
        heading: "Opzioni facoltative",
        body: "",
        items: [
          line("Produzione contenuti", "Copywriting professionale per le pagine principali.", 900),
          line("Servizio fotografico", "Shooting dedicato (mezza giornata).", 1200),
          line("Multilingua", "Versione in lingua aggiuntiva.", 700),
        ],
      },
      { id: "b-summary", type: "summary", heading: "Riepilogo economico", body: "", breakdown: true },
      {
        id: "b-timeline",
        type: "timeline",
        heading: "Tempistiche",
        steps: [
          { id: "s1", label: "Settimana 1", title: "Analisi e briefing" },
          { id: "s2", label: "Settimane 2-3", title: "Progettazione UX/UI" },
          { id: "s3", label: "Settimane 4-6", title: "Sviluppo e integrazione" },
          { id: "s4", label: "Settimana 7", title: "Test, go live e formazione" },
        ],
      },
      {
        id: "b-terms",
        type: "terms",
        heading: "Condizioni",
        body: "",
        payment: "40% alla conferma dell'ordine, 40% a sviluppo completato, 20% alla messa online.",
        notes: "Eventuali attività aggiuntive saranno preventivate a parte, previo accordo.",
      },
      { id: "b-contacts", type: "contacts", heading: "Contatti e accettazione", body: "" },
    ],
  };
  return documentSchema.parse(raw);
}

export function demoSnapshot(template: TemplateKey, options: { services?: QuoteLine[]; title?: string; logo?: { mime: string; dataBase64: string } | null } = {}): QuoteSnapshot {
  const document = demoDocument(template, options);
  const fiscal = { taxProfile: "ordinario" as const, stampDutyNote: false };
  return {
    rendererVersion: "quotes-renderer@2",
    quote: { id: "q-demo", number: "PRE-2025-001", title: "Nuovo Sito Web", issuedAt: "2025-01-20T10:00:00.000Z", validUntil: "2025-02-20T12:00:00.000Z" },
    client: { name: "Cliente Esempio", kind: "azienda", vatNumber: "00000000000", taxCode: null, address: "Via Cliente 1, 20100 Milano (MI)", email: null, contactName: null },
    issuer: {
      displayName: "Studio Esempio",
      companyName: "Studio Esempio",
      vatNumber: "00000000000",
      taxCode: null,
      address: "Via Esempio 10, 20100 Milano (MI)",
      email: "info@studioesempio.it",
      phone: "+39 02 1234 5678",
      website: "www.studioesempio.it",
      ownerName: null,
      ownerEmail: null,
    },
    brand: { colorPrimary: "#0B0B0F", colorSecondary: "#7C3AED", colorBackground: "#FFFFFF", fontHeading: "Inter", fontBody: "Inter", logo: options.logo ?? null },
    template,
    fiscal,
    document,
    totals: computeTotals(document, fiscal),
    images: [],
  };
}
