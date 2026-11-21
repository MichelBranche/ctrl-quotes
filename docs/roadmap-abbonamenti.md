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
- Analytics avanzate in Workspace > Analytics avanzate: imbuto con periodo su tutti i piani, tempi di risposta, valore nel tempo, pipeline, coinvolgimento, template e clienti su Pro, servizi più venduti, team e incassi su Business
- Collaborazione team (inviti via email, ruoli owner/admin/member, reinvio e revoca)
- Persone nel workspace: 1 su Starter, 5 su Pro, illimitate su Business, titolare compreso, incluse nell'abbonamento. Durante il Piano di prova si applica il limite Starter (1): chi ha già più persone le tiene, ma non può invitarne altre.

## In arrivo, per piano

### Starter
- Nessuna funzionalità in arrivo.

### Pro
- Template personalizzati (esiste il brand kit, non i template su misura)
- Supporto prioritario

### Business
- Controlli amministrativi (oggi solo ruoli owner/admin/member)
- Sicurezza avanzata
- Supporto prioritario 24/7

### Tabella "Confronta i piani"
- Template personalizzati (Pro, Business)
- Collaborazione team (Pro, Business): ora disponibile
- Persone nel workspace (1 / 5 / illimitate, incluse nell'abbonamento)
- Supporto prioritario (Business)

Nota: nel mockup la tabella segna "Supporto prioritario" solo per Business, mentre la pagina Pro lo elenca in "Cosa include".
Riportati entrambi come da mockup: da allineare quando si definiscono i limiti dei piani.

## Stripe (Fase 5)

- Checkout e portale sono attivi solo se `STRIPE_SECRET_KEY` è impostata. Senza chiave l'interfaccia resta com'è.
- Si vendono Pro e Business, mensile o annuale (dodici mesi meno il 20%, importi derivati in `plans.ts`).
- `workspaces.plan` resta `free` / `pro` / `studio` (Business = `studio`). Lo Starter a pagamento resta `free` nella riga: lo distingue l'abbonamento attivo con piano `starter` (vedi `summaryPlanValue`).
- Metadata Stripe: `app=ctrl-quotes` e, dove esiste, `workspace_id`. Lookup key: `ctrl_quotes_pro_monthly`, `ctrl_quotes_pro_yearly`, `ctrl_quotes_business_monthly`, `ctrl_quotes_business_yearly`.
- Dettagli operativi: `docs/stripe.md`.
