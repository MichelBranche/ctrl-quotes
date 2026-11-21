/**
 * Contents of Aiuto e Supporto. Every sentence describes what the app does today: limits come from
 * `plans.ts`, roles from `permissions.ts`. When a feature changes, update the text here.
 */
import { quoteSendDailyLimits, teamSeatLimits } from "@/domain/plans";

export const SUPPORT_EMAIL = "hello@ctrlagency.dev";

export function supportMailto(subject: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export type HelpTopicId = "primi-passi" | "preventivi" | "clienti" | "catalogo" | "template" | "impostazioni";

export type HelpSection = { title: string; body?: string; steps?: string[] };

export type HelpTopic = {
  id: HelpTopicId;
  title: string;
  summary: string;
  sections: HelpSection[];
  /** Where the feature lives in the app. */
  cta: { label: string; href: string };
};

const sends = (n: number | null) => (n == null ? "illimitati" : String(n));
const seats = (n: number | null) => (n == null ? "illimitate" : String(n));

export const helpTopics: HelpTopic[] = [
  {
    id: "primi-passi",
    title: "Primi passi",
    summary: "Workspace, prova gratuita e configurazione iniziale.",
    cta: { label: "Vai all'Overview", href: "/app/overview" },
    sections: [
      {
        title: "Il workspace",
        body: "Il workspace contiene clienti, catalogo, preventivi e Brand Kit. Ogni workspace è separato dagli altri: puoi crearne più di uno e passare dall'uno all'altro dalla sezione Workspace.",
      },
      {
        title: "La prova gratuita",
        body: "Alla creazione del workspace parte una prova gratuita di 7 giorni, senza carta, con i limiti del piano Starter. Due giorni prima della fine ti avvisiamo. Finita la prova i dati restano consultabili, ma per modificarli serve un abbonamento attivo.",
      },
      {
        title: "Configurazione iniziale",
        body: "Nell'Overview trovi la scheda Configurazione iniziale con tre passaggi:",
        steps: [
          "Personalizza il tuo brand: logo, colori e dati aziendali nel Brand Kit.",
          "Aggiungi i tuoi servizi al Catalogo, così li inserisci nei preventivi in un clic.",
          "Crea il primo preventivo.",
        ],
      },
      {
        title: "Ruoli",
        body: "Ci sono tre ruoli: proprietario, amministratore e membro. Il membro crea e invia preventivi, gestisce clienti e catalogo. L'amministratore può anche eliminare, importare clienti da CSV, cambiare impostazioni e Brand Kit e invitare persone. Solo il proprietario cambia i ruoli e gestisce l'abbonamento.",
      },
    ],
  },
  {
    id: "preventivi",
    title: "Preventivi",
    summary: "Crea, modifica, invia e segui le risposte dei clienti.",
    cta: { label: "Vai ai preventivi", href: "/app/quotes" },
    sections: [
      {
        title: "Creare un preventivo",
        steps: [
          "Da Preventivi premi Nuovo preventivo.",
          "Scegli il cliente dalla rubrica e scrivi il titolo, per esempio Redesign sito web.",
          "Se vuoi, aggiungi due righe di introduzione e le voci del catalogo.",
          "Indica la validità in giorni: la data di scadenza si calcola da sola, partendo dal valore delle impostazioni.",
          "Scegli il template e apri il preventivo nell'editor.",
        ],
      },
      {
        title: "L'editor",
        body: "L'editor ha due modalità: Modulo, per compilare i contenuti blocco per blocco, e Visuale, per lavorare direttamente sulla pagina (da computer, con una finestra larga almeno 1180 px). La bozza si salva da sola; puoi annullare e ripetere con Ctrl+Z e Ctrl+Maiusc+Z e vedere l'anteprima desktop e mobile. Nella cronologia salvi una versione quando la bozza è pronta e puoi ripristinarne una precedente.",
      },
      {
        title: "Inviare al cliente",
        body: "Dal pulsante Invia preventivo scegli la modalità:",
        steps: [
          "Email con link: il cliente riceve un'email con il suo link personale. Puoi allegare anche il PDF.",
          "Solo link: nessuna email parte. Copi il link e lo condividi come preferisci; il preventivo viene segnato come Inviato.",
        ],
      },
      {
        title: "Dopo l'invio",
        body: "Puoi continuare a modificare la bozza: il cliente vede l'ultima versione inviata finché non premi Invia aggiornamento. Il link vale fino all'ultimo giorno di validità, oppure resta senza scadenza se la validità non c'è. Dal pannello di invio puoi copiarlo, rigenerarlo o revocarlo. Vedi quando il cliente apre il preventivo e quante volte.",
      },
      {
        title: "Accettazione e rifiuto",
        body: "Il cliente non deve registrarsi: apre il link, legge il preventivo e lo accetta o lo rifiuta indicando nome ed email. Un preventivo accettato resta bloccato e non si modifica più. Dopo un rifiuto puoi inviare una nuova versione.",
      },
      {
        title: "Limiti di invio",
        body: `Le email ai clienti hanno un limite giornaliero per piano: ${sends(quoteSendDailyLimits.starter)} al giorno con Starter, ${sends(quoteSendDailyLimits.pro)} con Pro, ${sends(quoteSendDailyLimits.business)} con Business.`,
      },
      {
        title: "Duplicare ed eliminare",
        body: "Dall'elenco puoi duplicare un preventivo per partire da uno già fatto. Eliminare è riservato ad amministratori e proprietario.",
      },
    ],
  },
  {
    id: "clienti",
    title: "Clienti",
    summary: "Rubrica, referenti, note e import da CSV.",
    cta: { label: "Vai ai clienti", href: "/app/clients" },
    sections: [
      {
        title: "La rubrica",
        body: "Ogni cliente può essere un'azienda o un privato. Per ognuno salvi i dati di contatto e fiscali, più referenti e note interne che il cliente non vede. Cerchi per nome, email o settore e filtri per stato e tipo. Nella scheda del cliente trovi anche i suoi preventivi.",
      },
      {
        title: "Archiviare o eliminare",
        body: "Un cliente che non segui più si archivia e si ripristina quando serve. L'eliminazione definitiva è riservata ad amministratori e proprietario.",
      },
      {
        title: "Importare da CSV",
        steps: [
          "Esporta i contatti da Excel, Numbers o Google Fogli in CSV (separatore punto e virgola, virgola o tabulazione).",
          "In Clienti scegli Importa clienti da CSV e carica il file: massimo 1 MB e 1000 righe.",
          "Abbina le colonne ai campi: le intestazioni italiane più comuni vengono riconosciute da sole.",
          "Controlla l'anteprima: i doppioni per email, partita IVA o nome e gli errori sono segnalati riga per riga.",
        ],
        body: "L'import è riservato ad amministratori e proprietario.",
      },
    ],
  },
  {
    id: "catalogo",
    title: "Catalogo",
    summary: "Servizi, prodotti e pacchetti pronti da inserire.",
    cta: { label: "Vai al catalogo", href: "/app/catalog" },
    sections: [
      {
        title: "Cosa puoi salvare",
        body: "Servizi, prodotti e pacchetti che raggruppano più voci. Ogni voce ha prezzo, aliquota IVA (22, 10, 5, 4 o 0% con la natura dell'esenzione) e ricorrenza: una tantum, mensile o annuale. I totali si calcolano con lo stesso motore dei preventivi.",
      },
      {
        title: "Categorie",
        body: "Le categorie tengono in ordine il catalogo. Crearle, rinominarle ed eliminarle è compito di amministratori e proprietario.",
      },
      {
        title: "Duplicare ed eliminare",
        body: "Puoi duplicare una voce per crearne una simile. Una voce usata in un pacchetto non si può eliminare finché non la togli dal pacchetto; l'eliminazione è riservata ad amministratori e proprietario.",
      },
    ],
  },
  {
    id: "template",
    title: "Template",
    summary: "Lo stile dei tuoi preventivi, su web e PDF.",
    cta: { label: "Vai ai template", href: "/app/templates" },
    sections: [
      {
        title: "I template disponibili",
        body: "Cinque template su pagine A4: Swiss Minimal, Studio Editorial, Editorial Atelier, Corporate Executive e Bold Impact. Lo stesso template disegna l'anteprima, la pagina del cliente e il PDF.",
      },
      {
        title: "Preferiti e predefinito",
        body: "Segna i template che usi di più come preferiti. Il template predefinito, proposto a ogni nuovo preventivo, lo scelgono amministratori e proprietario.",
      },
      {
        title: "Personalizzare il singolo preventivo",
        body: "Nell'editor scegli la foto di copertina tra quelle del template o ne carichi una tua, e il colore d'accento: quello del template, quello del Brand Kit o uno personalizzato, con il controllo del contrasto.",
      },
    ],
  },
  {
    id: "impostazioni",
    title: "Impostazioni",
    summary: "Brand Kit, fisco, numerazione, pagamenti e team.",
    cta: { label: "Vai alle impostazioni", href: "/app/settings" },
    sections: [
      {
        title: "Brand Kit",
        body: "Logo PNG, JPG o SVG fino a 1 MB, colori con verifica del contrasto, tipografia e dati aziendali (nome, partita IVA, indirizzo, contatti) usati nei preventivi.",
      },
      {
        title: "Fiscale e IVA",
        body: "Scegli il regime: ordinario con IVA, forfettario senza IVA (con la nota sul bollo da 2 € sopra 77,47 € se la attivi) o estero senza IVA italiana. Imposti anche l'aliquota predefinita e se i prezzi inseriti sono IVA inclusa o esclusa.",
      },
      {
        title: "Numerazione",
        body: "Il formato del numero si compone con i segnaposto {YYYY} anno, {YY} anno breve e {0000} contatore. Il contatore può ripartire ogni anno dal 1° gennaio oppure continuare senza azzerarsi.",
      },
      {
        title: "Condizioni e note",
        body: "Testo proposto in fondo a ogni nuovo preventivo e validità predefinita, da 1 a 365 giorni.",
      },
      {
        title: "Pagamenti",
        body: "Scegli come il cliente può pagare: bonifico (IBAN, intestatario e causale da copiare), PayPal con un link paypal.me, oppure carta tramite il tuo account Stripe collegato. I soldi arrivano sul tuo conto, non su CTRL. Di solito i pagamenti compaiono dopo l'accettazione, ma puoi mostrarli anche prima.",
      },
      {
        title: "Team e ruoli",
        body: `Amministratori e proprietario invitano persone via email. Le persone incluse dipendono dal piano: ${seats(teamSeatLimits.starter)} con Starter, fino a ${seats(teamSeatLimits.pro)} con Pro, ${seats(teamSeatLimits.business)} con Business.`,
      },
    ],
  },
];

export function findTopic(id: string): HelpTopic | undefined {
  return helpTopics.find((topic) => topic.id === id);
}

export type HelpFaq = { q: string; a: string };

export const helpFaqs: HelpFaq[] = [
  {
    q: "Il cliente deve creare un account per vedere il preventivo?",
    a: "No. Apre il suo link personale, legge il preventivo e lo accetta o lo rifiuta indicando nome ed email.",
  },
  {
    q: "Posso modificare un preventivo già inviato?",
    a: "Sì, finché non è accettato. Il cliente continua a vedere l'ultima versione inviata finché non premi Invia aggiornamento.",
  },
  {
    q: "Come capisco se il cliente ha aperto il preventivo?",
    a: "Nel preventivo trovi quando è stato aperto la prima e l'ultima volta e quante volte.",
  },
  {
    q: "Quando scade il link del cliente?",
    a: "Dopo l'ultimo giorno di validità del preventivo. Se non imposti una validità, il link non scade. Puoi comunque revocarlo o rigenerarlo in ogni momento.",
  },
  {
    q: "Quante email posso inviare ai clienti ogni giorno?",
    a: `${sends(quoteSendDailyLimits.starter)} con Starter, ${sends(quoteSendDailyLimits.pro)} con Pro, ${sends(quoteSendDailyLimits.business)} con Business. Con la modalità Solo link nessuna email parte da CTRL® Quotes.`,
  },
  {
    q: "Cosa succede quando finisce la prova gratuita?",
    a: "I tuoi dati restano dove sono e li puoi consultare. Per modificarli attiva un abbonamento da Impostazioni, Fatturazione.",
  },
  {
    q: "Dove arrivano i pagamenti dei clienti?",
    a: "Direttamente sul tuo conto: bonifico e PayPal vanno ai tuoi riferimenti, la carta passa dal tuo account Stripe. CTRL non incassa nulla per tuo conto.",
  },
  {
    q: "Perché non riesco a eliminare un cliente o un preventivo?",
    a: "Eliminare è riservato ad amministratori e proprietario. Un cliente puoi sempre archiviarlo.",
  },
  {
    q: "Al login il pulsante non va avanti: cosa faccio?",
    a: "Di solito la verifica anti-bot di Cloudflare è bloccata da un adblock, una VPN o una rete aziendale. Disattivali per questo sito o prova un altro browser; il messaggio sotto il pulsante riporta un codice da inviarci se il problema resta.",
  },
];

export type HelpUpdate = { date: string; title: string; body: string };

/** Taken from the release history on main. Newest first. */
export const helpUpdates: HelpUpdate[] = [
  {
    date: "2026-11-21",
    title: "Login più chiaro",
    body: "Se la verifica anti-bot di Cloudflare non si carica, la pagina spiega cosa succede e permette di riprovare.",
  },
  {
    date: "2026-11-15",
    title: "Editor rinnovato",
    body: "Barra del testo, font Google e Fontshare, stile per blocco, struttura ad albero e pannello Documento.",
  },
  {
    date: "2026-11-15",
    title: "Pagamenti dei preventivi",
    body: "Il cliente può pagare con bonifico, PayPal o carta tramite il tuo account Stripe.",
  },
  {
    date: "2026-11-15",
    title: "Prova gratuita e abbonamenti",
    body: "Prova di 7 giorni senza carta, onboarding guidato, piani Starter, Pro e Business anche annuali.",
  },
  {
    date: "2026-11-15",
    title: "Inviti al team",
    body: "Inviti via email, gestione dei membri e limiti di persone per piano.",
  },
  {
    date: "2026-11-14",
    title: "Invio reale dei preventivi",
    body: "Email al cliente con link personale, accettazione online e avvisi quando il cliente risponde.",
  },
];

export type HelpResource = { title: string; body: string; href: string };

export const helpResources: HelpResource[] = [
  { title: "Galleria template", body: "Sfoglia i cinque template e scegli il predefinito.", href: "/app/templates" },
  { title: "Confronta i piani", body: "Limiti e funzioni di Starter, Pro e Business.", href: "/app/settings/billing/compare" },
  { title: "Termini di servizio", body: "Le condizioni d'uso di CTRL® Quotes.", href: "/termini" },
  { title: "Privacy e cookie", body: "Come trattiamo i dati tuoi e dei tuoi clienti.", href: "/privacy" },
];

export type HelpSearchItem = { kind: "Guida" | "FAQ" | "Risorsa"; title: string; text: string; href: string };

/** Flat index for the search box: one entry per guide section, FAQ and resource. */
export function helpSearchIndex(): HelpSearchItem[] {
  const items: HelpSearchItem[] = [];
  for (const topic of helpTopics) {
    items.push({ kind: "Guida", title: topic.title, text: topic.summary, href: `/app/help/${topic.id}` });
    topic.sections.forEach((section, index) => {
      items.push({
        kind: "Guida",
        title: `${topic.title}: ${section.title}`,
        text: [section.body, ...(section.steps ?? [])].filter(Boolean).join(" "),
        href: `/app/help/${topic.id}#s${index + 1}`,
      });
    });
  }
  helpFaqs.forEach((faq, index) => items.push({ kind: "FAQ", title: faq.q, text: faq.a, href: `/app/help/faq#f${index + 1}` }));
  helpResources.forEach((res) => items.push({ kind: "Risorsa", title: res.title, text: res.body, href: res.href }));
  return items;
}
