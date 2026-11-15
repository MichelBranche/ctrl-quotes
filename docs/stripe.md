# Stripe in CTRL Quotes

Checkout e portale cliente si accendono solo se `STRIPE_SECRET_KEY` è impostata. Senza chiave, e senza le altre variabili, la pagina Abbonamento resta com'è: il pulsante apre "Pagamenti in arrivo" e non partono errori.

## Cosa si vende

- Piani **Pro** e **Business**, mensili o annuali, importi da `src/domain/plans.ts` in EUR.
- L'annuale è dodici mesi meno il 20% (Starter 86,40 EUR, Pro 182,40 EUR, Business 470,40 EUR). Tutti e tre i piani si acquistano.

## Prova gratuita

Ogni workspace ha sette giorni di prova, senza carta, con i limiti del piano Starter (`TRIAL_PLAN_ID` e `TRIAL_DURATION_DAYS` in `src/domain/plans.ts`). La prova parte quando l'utente accetta dalla schermata di onboarding, non alla sola creazione dell'account. I workspace già esistenti ricevono la stessa scadenza di sette giorni al momento della migration.

Se si sottoscrive durante la prova, Checkout imposta `subscription_data.trial_end` alla fine della prova del workspace: il primo addebito arriva in quella data. Dopo la scadenza, Checkout parte subito. A prova terminata, senza abbonamento o codice a vita, il workspace è in sola lettura (i link pubblici `/q/` restano utilizzabili). Un codice lifetime Business sblocca il piano senza sottoscrizione Stripe.

## Variabili

- `STRIPE_SECRET_KEY` (obbligatoria per accendere i pagamenti)
- `STRIPE_WEBHOOK_SECRET` (obbligatoria per i webhook)
- `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_YEARLY`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`, `STRIPE_PRICE_BUSINESS_MONTHLY`, `STRIPE_PRICE_BUSINESS_YEARLY` (facoltative se esistono i lookup key)
- `STRIPE_TAX_RATE_IVA`: Tax Rate "IVA 22%" (inclusive=false, IT), creata da `npm run stripe:setup`. Il checkout la mette in `subscription_data.default_tax_rates`, quindi resta sui rinnovi e sui cambi di piano dal portale. I prezzi dei piani sono netti. Niente Stripe Tax automatico (a pagamento). Il checkout raccoglie indirizzo di fatturazione e partita IVA (`tax_id_collection`, gratuito).

Lookup key: `ctrl_quotes_pro_monthly`, `ctrl_quotes_pro_yearly`, `ctrl_quotes_business_monthly`, `ctrl_quotes_business_yearly`.

## Setup

```sh
npm run stripe:setup
```

Crea in modo idempotente prodotti, prezzi mensili e annuali e la configurazione di default del Customer Portal (incluso il passaggio tra mensile e annuale) (test o live, secondo la chiave). Ogni oggetto ha `metadata.app=ctrl-quotes`. Client, sessioni di checkout e sottoscrizioni hanno anche `workspace_id`.

Webhook: `https://quotes.ctrlagency.dev/api/stripe/webhook`

Eventi gestiti: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Gli eventi sono idempotenti (`stripe_processed_events`).

Un downgrade o una disdetta non rimuove i membri: se i posti superano il nuovo limite, si bloccano solo i nuovi inviti.

## Stripe Connect (incasso dei preventivi)

I pagamenti dei preventivi non passano dal conto di CTRL: ogni workspace collega il **proprio** account Stripe (Connect Express, Italia / EUR) e incassa con un Checkout in modalità direct charge (`Stripe-Account`). `application_fee_amount` è la costante `CONNECT_APPLICATION_FEE_AMOUNT` (oggi 0).

Onboarding in-app («Collega Stripe»): Accounts v2 (`POST /v2/core/accounts`), versione `2026-10-28.preview` (necessaria per dashboard Express con Managed Risk: `fees_collector` e `losses_collector` = `stripe`). Paese IT, valuta EUR, capability `card_payments`, metadata `app=ctrl-quotes` e `workspace_id`. Poi Account Link v2 (`POST /v2/core/account_links`, use_case `account_onboarding`) con ritorno `/app/settings/payments?stripe=ritorno` e ripartenza `?stripe=riparti`. Lo stato (non collegato / in verifica / attivo) si legge dalla capability `card_payments` (o da `charges_enabled` se l'oggetto è ancora in forma v1). Il Checkout resta un direct charge (`Stripe-Account`).

Webhook dedicato (eventi degli account collegati): `https://quotes.ctrlagency.dev/api/stripe/connect/webhook`

Segreto: `STRIPE_CONNECT_WEBHOOK_SECRET` (Production). Eventi: `account.updated`, `checkout.session.completed`, `payment_intent.succeeded`. Idempotenza condivisa con `stripe_processed_events`.

Se l'API risponde che Connect non è attivo sulla piattaforma, il codice resta disponibile ma l'onboarding mostra l'errore. In Dashboard test:

1. https://dashboard.stripe.com/test/settings/connect
2. Interruttore su Test
3. Avvia Connect e accetta i termini della piattaforma
4. https://dashboard.stripe.com/test/webhooks : endpoint del Connect webhook, eventi degli account collegati
5. Copia il `whsec_…` in `STRIPE_CONNECT_WEBHOOK_SECRET` e ridistribuisci
