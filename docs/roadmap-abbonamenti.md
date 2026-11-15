# Roadmap Abbonamenti

La sezione Abbonamento (`/app/settings/billing`, con `/compare`, `/starter`, `/pro`, `/business`) mostra i tre piani
come da mockup. Le funzionalità che oggi non esistono restano visibili con l'etichetta **In arrivo**: le teniamo nell'interfaccia
e le togliamo più avanti se decidiamo che non ci interessano. Fonte unica dei testi e dei flag: `src/domain/plans.ts`.

## Stato attuale

- Nessun pagamento: "Attiva il piano" apre l'avviso "Pagamenti in arrivo". Nessun checkout, nessuna scrittura su DB.
- Piano corrente: `workspaces.plan` vale sempre `free` e viene mostrato come **Piano di prova**.
- Le tabelle `subscriptions` e `subscription_events` esistono ma non sono usate.

## Già disponibili

- Creazione preventivi
- Gestione clienti
- Report di base (KPI della panoramica: valore, inviati, accettati)
- Template standard (5 template)
- Tutte le funzionalità Starter (Pro)
- Tutte le funzionalità Pro (Business): disponibili solo le parti già presenti in Pro
- Collaborazione team (inviti via email, ruoli owner/admin/member, reinvio e revoca)
- Posti nel team: 1 su Starter, 5 su Pro, illimitati su Business. Durante il Piano di prova si applicano i 5 posti del Piano Pro, finché non esiste il checkout.
- Utenti illimitati (Piano Business)

## In arrivo, per piano

### Starter
- Nessuna funzionalità in arrivo.

### Pro
- Analytics avanzate
- Template personalizzati (esiste il brand kit, non i template su misura)
- Supporto prioritario

### Business
- Controlli amministrativi (oggi solo ruoli owner/admin/member)
- Sicurezza avanzata
- Supporto prioritario 24/7

### Tabella "Confronta i piani"
- Template personalizzati (Pro, Business)
- Collaborazione team (Pro, Business): ora disponibile
- Posti nel team (1 / 5 / illimitati)
- Supporto prioritario (Business)

Nota: nel mockup la tabella segna "Supporto prioritario" solo per Business, mentre la pagina Pro lo elenca in "Cosa include".
Riportati entrambi come da mockup: da allineare quando si definiscono i limiti dei piani.

## Da decidere in Fase 5 (Stripe)

- Mappatura dei valori di `workspaces.plan` (`free` / `pro` / `studio`) sui piani **Starter / Pro / Business**:
  rinominare i valori con una migrazione oppure tenere i nomi interni e mapparli solo in UI.
- Cosa resta del Piano di prova (durata, limiti) quando arriva il checkout.
- Checkout Stripe, portale cliente, webhook su `subscription_events`, prezzi IVA inclusa o esclusa.
