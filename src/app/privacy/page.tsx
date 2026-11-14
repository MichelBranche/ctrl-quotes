import type { Metadata } from "next";
import { LegalShell } from "@/components/legal/legal-shell";
import { legalOperator, legalPlaceholders, localPreferences, ownCookies } from "@/domain/legal";

export const metadata: Metadata = { title: "Privacy policy" };

function Placeholder({ value }: { value: string }) {
  return <span className="legal-placeholder">{value}</span>;
}

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy policy">
      <p>
        Questa informativa descrive come {legalOperator.operator} ({legalOperator.owner}) tratta i dati personali
        quando usi {legalOperator.product}, disponibile su {legalOperator.appHost}. Il trattamento avviene secondo il
        Regolamento (UE) 2016/679 (GDPR) e la normativa italiana applicabile.
      </p>

      <h2>1. Titolare del trattamento</h2>
      <p>
        Titolare: {legalOperator.owner}, in qualità di titolare di {legalOperator.operator}, operatore di {legalOperator.product}.
      </p>
      <ul>
        <li>Sito: {legalOperator.site}</li>
        <li>Applicazione: {legalOperator.appHost}</li>
        <li>Sede legale: <Placeholder value={legalPlaceholders.address} /></li>
        <li>Partita IVA: <Placeholder value={legalPlaceholders.vat} /></li>
        <li>Contatto per richieste privacy: <Placeholder value={legalPlaceholders.privacyEmail} /></li>
      </ul>
      <p>
        I campi evidenziati sono segnaposto: i dati societari completi verranno inseriti dal titolare e questa
        informativa andrà aggiornata di conseguenza.
      </p>

      <h2>2. Dati che trattiamo</h2>
      <p>Trattiamo solo i dati necessari a erogare il servizio, in particolare:</p>
      <ul>
        <li>Dati dell&apos;account: nome, indirizzo email, hash della password, stato di verifica dell&apos;email, eventuale collegamento all&apos;account Google, sessioni (inclusi, se forniti dal client, indirizzo IP e user agent).</li>
        <li>Dati del workspace: nome, membri e ruoli, impostazioni fiscali e di numerazione, brand kit, catalogo, template, condizioni e note.</li>
        <li>Dati operativi che inserisci: clienti, preventivi, versioni, accettazioni o rifiuti, eventi, note, file e immagini del preventivo.</li>
        <li>Comunicazioni: invio di preventivi, conferme, reimpostazione della password, avvisi al titolare del workspace, registri di consegna delle email.</li>
        <li>Dati tecnici: limiti di frequenza, registri di audit, processi in coda, copie di sicurezza del database di produzione.</li>
        <li>Dati dei destinatari dei preventivi pubblici: nome e email se li forniscono in fase di accettazione o rifiuto, e traccia di apertura del link privato.</li>
      </ul>
      <p>
        La password non è conservata in chiaro: viene memorizzato solo un hash. I link pubblici dei preventivi usano
        un token personale: chi ha il link può vedere quella proposta.
      </p>

      <h2>3. Finalità e basi giuridiche</h2>
      <ul>
        <li>Erogazione del servizio (account, workspace, preventivi, invii, accettazione elettronica semplice): esecuzione del contratto o misure precontrattuali.</li>
        <li>Sicurezza (verifica anti-bot, limiti di frequenza, sessioni, audit): legittimo interesse a proteggere il servizio e i suoi utenti.</li>
        <li>Obblighi di legge, se e quando applicabili (per esempio richieste dell&apos;autorità).</li>
        <li>Messaggi transazionali strettamente legati all&apos;uso del servizio (non usiamo i tuoi dati per marketing profilato).</li>
      </ul>
      <p>
        L&apos;accettazione di un preventivo tramite {legalOperator.product} è un&apos;accettazione elettronica semplice. Non è una firma elettronica qualificata.
      </p>

      <h2>4. Responsabili e fornitori</h2>
      <p>
        Per erogare il servizio ci avvaliamo dei seguenti soggetti, nei limiti di quanto effettivamente usato dal codice
        e dalla configurazione in produzione:
      </p>
      <ul>
        <li>Vercel: hosting dell&apos;applicazione, funzioni serverless, configurazione, operazioni pianificate (cron).</li>
        <li>Turso (database libSQL): archivio principale dei dati dell&apos;applicazione.</li>
        <li>Resend: invio delle email transazionali (per esempio verifica account, reimpostazione password, invio del preventivo, avvisi al titolare, segnalazioni tecniche).</li>
        <li>Vercel Blob (archivio privato): copie di sicurezza periodiche del database di produzione, conservate in modo non pubblico e ruotate (ultime 14 copie).</li>
        <li>Better Auth: libreria di autenticazione usata dal servizio (sessioni, email e password, eventuale accesso Google).</li>
        <li>Google: accesso con Google, solo se questa opzione è configurata e la usi.</li>
        <li>Cloudflare Turnstile: verifica anti-bot nei moduli di accesso e registrazione, solo se configurata.</li>
      </ul>
      <p>
        Il codice prevede anche un eventuale uso di Upstash Redis per i limiti di frequenza. Se le relative variabili
        non sono configurate, i limiti restano sul database Turso e Upstash non riceve dati.
      </p>
      <p>Non usiamo strumenti di analisi pubblicitaria, pixel di tracciamento o profilazione commerciale.</p>

      <h2 id="cookie">5. Cookie e archiviazione locale</h2>
      <p>
        {legalOperator.product} imposta solo cookie tecnici, necessari al funzionamento. Non usiamo cookie di profilazione
        o di marketing e, in questo assetto, non è richiesto un banner di consenso per i cookie.
      </p>
      <table>
        <thead>
          <tr>
            <th>Cookie</th>
            <th>Finalità</th>
            <th>Durata</th>
          </tr>
        </thead>
        <tbody>
          {ownCookies.map((cookie) => (
            <tr key={cookie.name}>
              <td>{cookie.name}</td>
              <td>{cookie.purpose}</td>
              <td>{cookie.duration}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Nel browser può inoltre essere salvata una preferenza di interfaccia:</p>
      <ul>
        {localPreferences.map((item) => (
          <li key={item.name}>
            <strong>{item.name}</strong>: {item.purpose}
          </li>
        ))}
      </ul>
      <p>
        Durante l&apos;accesso con Google, Google può impostare cookie di propria competenza sui propri domini. Durante la
        verifica anti-bot, Cloudflare può impostare cookie tecnici sui propri domini. Questi cookie non sono impostati
        da {legalOperator.product} e dipendono dai rispettivi servizi, usati solo per autenticazione e sicurezza.
      </p>
      <p>Puoi cancellare i cookie dal browser. Senza il cookie di sessione dovrai accedere di nuovo.</p>

      <h2>6. Conservazione</h2>
      <ul>
        <li>I dati dell&apos;account e del workspace restano finché l&apos;account o il workspace è attivo, salvo obblighi di legge.</li>
        <li>Le sessioni scadono secondo le regole di autenticazione.</li>
        <li>I log di audit del workspace sono conservati in modo append-only, per tracciare operazioni rilevanti.</li>
        <li>Le copie di sicurezza del database di produzione su Vercel Blob privato sono trattenute per 14 giorni, poi le più vecchie vengono eliminate in automatico.</li>
        <li>I limiti di frequenza hanno una scadenza breve e vengono periodicamente rimossi.</li>
      </ul>
      <p>
        Puoi chiedere la cancellazione dell&apos;account o del workspace con le funzioni dell&apos;applicazione, dove disponibili,
        oppure scrivendo al contatto privacy indicato sopra, una volta completato il segnaposto.
      </p>

      <h2>7. Trasferimenti</h2>
      <p>
        I fornitori possono trattare dati anche fuori dallo Spazio economico europeo, secondo le loro condizioni e le
        garanzie previste (per esempio clausole contrattuali tipo). In particolare Vercel, Turso, Resend, Google e
        Cloudflare operano come servizi cloud. Aggiorneremo questa sezione se cambiano i fornitori effettivamente usati.
      </p>

      <h2>8. I tuoi diritti</h2>
      <p>
        Nei limiti di legge puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opporti al
        trattamento. Puoi anche proporre reclamo al Garante per la protezione dei dati personali. Per esercitare i
        diritti usa il contatto privacy indicato sopra, quando sarà compilato, oppure le funzioni del tuo account.
      </p>

      <h2>9. Aggiornamenti</h2>
      <p>
        Questa informativa può cambiare se cambia il servizio. La data di aggiornamento è indicata in cima alla pagina.
        In caso di modifiche sostanziali, valuteremo un avviso in applicazione o via email.
      </p>
    </LegalShell>
  );
}
