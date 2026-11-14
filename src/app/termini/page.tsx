import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/legal/legal-shell";
import { legalOperator, legalPlaceholders } from "@/domain/legal";

export const metadata: Metadata = { title: "Termini di servizio" };

function Placeholder({ value }: { value: string }) {
  return <span className="legal-placeholder">{value}</span>;
}

export default function TermsPage() {
  return (
    <LegalShell title="Termini di servizio">
      <p>
        Questi termini regolano l&apos;uso di {legalOperator.product}, servizio online per creare, gestire e inviare
        preventivi, offerto da {legalOperator.operator} ({legalOperator.owner}) su {legalOperator.appHost}.
        Usando il servizio accetti questi termini. La <Link href="/privacy">Privacy policy</Link> descrive il trattamento dei dati.
      </p>
      <p className="legal-review" role="note" style={{ marginTop: 12 }}>
        Bozza da far revisionare a un professionista prima di considerarla un contratto vincolante.
      </p>

      <h2>1. Titolare e dati societari</h2>
      <ul>
        <li>Operatore: {legalOperator.operator} ({legalOperator.owner})</li>
        <li>Sito: {legalOperator.site} · App: {legalOperator.appHost}</li>
        <li>Sede legale: <Placeholder value={legalPlaceholders.address} /></li>
        <li>Partita IVA: <Placeholder value={legalPlaceholders.vat} /></li>
      </ul>
      <p>I campi evidenziati sono segnaposto e saranno completati dal titolare.</p>

      <h2>2. Il servizio</h2>
      <p>
        {legalOperator.product} consente di organizzare workspace, clienti, catalogo e template, redigere preventivi,
        inviarli al destinatario con un link privato e raccogliere un&apos;accettazione o un rifiuto per via elettronica
        semplice. Funzioni, limiti e disponibilità possono variare in base al piano e allo stato del prodotto.
      </p>
      <p>
        L&apos;accettazione raccolta tramite il servizio non equivale a una firma elettronica qualificata e non sostituisce
        gli adempimenti di legge che restano a tuo carico (fatturazione, obblighi fiscali, conservazioni obbligatorie).
      </p>

      <h2>3. Account e uso consentito</h2>
      <ul>
        <li>Devi fornire dati corretti, custodire le credenziali e usare un indirizzo email su cui puoi essere raggiunto.</li>
        <li>Se crei un workspace, sei responsabile di quanto vi inserisci e di chi inviti, nel rispetto dei ruoli.</li>
        <li>Non devi usare il servizio per attività illecite, per inviare comunicazioni non richieste in violazione di legge, per tentare di accedere ad account o dati altrui, o per compromettere la sicurezza della piattaforma.</li>
        <li>I contenuti che carichi (testi, prezzi, loghi, dati dei clienti) restano tuoi. Ci concedi solo la licenza tecnica necessaria a ospitarli, mostrarli e inviarli nell&apos;ambito del servizio.</li>
      </ul>

      <h2>4. Piani, limiti e pagamento</h2>
      <p>
        Alcune funzioni possono essere legate a un piano o a un codice di riscatto. I dettagli di piano visibili
        in applicazione prevalgono, in caso di contrasto, su descrizioni promozionali. Prezzi, fatturazione e rinnovi,
        se attivati, saranno indicati in modo chiaro prima dell&apos;acquisto. Oggi il servizio può essere in fase di
        avvio: limiti e condizioni economiche possono ancora cambiare.
      </p>

      <h2>5. Email e link pubblici</h2>
      <p>
        Se invii un preventivo, il destinatario riceve un link personale. Chi possiede il link può vedere quella
        proposta. Sei responsabile dell&apos;indirizzo a cui lo invii e del rispetto delle norme sulle comunicazioni.
        Le email transazionali (accesso, verifica, invio preventivo, avvisi) partono dai sistemi di invio configurati
        per il servizio.
      </p>

      <h2>6. Disponibilità e responsabilità</h2>
      <p>
        Mettiamo cura nel tenere il servizio disponibile e integro, ma non garantiamo un funzionamento ininterrotto
        né l&apos;assenza totale di errori. Sono previste copie di sicurezza del database di produzione, con rotazione
        automatica, che non sostituiscono una tua eventuale conservazione dei documenti fiscalmente rilevanti.
      </p>
      <p>
        Nei limiti consentiti dalla legge, la responsabilità dell&apos;operatore per danni derivanti dall&apos;uso del servizio
        è limitata, e non copre i danni indiretti o il contenuto dei preventivi che redigi tu. Restano ferme le tutele
        inderogabili previste per i consumatori, se applicabili.
      </p>

      <h2>7. Sospensione e chiusura</h2>
      <p>
        Possiamo sospendere o chiudere un account in caso di violazione di questi termini o di rischio per la
        sicurezza. Puoi smettere di usare il servizio e, dove disponibile, eliminare il workspace o chiedere la
        cancellazione come descritto nella Privacy policy.
      </p>

      <h2>8. Modifiche</h2>
      <p>
        Possiamo aggiornare questi termini se il servizio cambia. La data in cima alla pagina indica l&apos;ultimo
        aggiornamento. Se la modifica è sostanziale, valuteremo un avviso in applicazione o via email. L&apos;uso
        continuato dopo l&apos;aggiornamento vale come accettazione, salvo che la legge preveda diversamente.
      </p>

      <h2>9. Legge applicabile</h2>
      <p>
        Si applica la legge italiana, fatte salve le norme inderogabili. Il foro competente sarà definito insieme ai
        dati della sede legale, quando il relativo segnaposto sarà completato.
      </p>
    </LegalShell>
  );
}
