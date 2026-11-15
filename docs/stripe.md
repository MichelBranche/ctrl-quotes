# Stripe in CTRL Quotes

Checkout e portale cliente si accendono solo se `STRIPE_SECRET_KEY` è impostata. Senza chiave, e senza le altre variabili, la pagina Abbonamento resta com'è: il pulsante apre "Pagamenti in arrivo" e non partono errori.

## Cosa si vende

- Piani **Pro** e **Business**, mensili o annuali, importi da `src/domain/plans.ts` in EUR.
- L'annuale è dodici mesi meno il 20% (Pro 182,40 EUR, Business 470,40 EUR). Lo Starter non si acquista.

## Variabili

- `STRIPE_SECRET_KEY` (obbligatoria per accendere i pagamenti)
- `STRIPE_WEBHOOK_SECRET` (obbligatoria per i webhook)
- `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`, `STRIPE_PRICE_BUSINESS_MONTHLY`, `STRIPE_PRICE_BUSINESS_YEARLY` (facoltative se esistono i lookup key)

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

Onboarding: da Impostazioni, Pagamenti, il proprietario o un amministratore avvia Account Links (`/app/settings/payments?stripe=ritorno` e `?stripe=riparti`).

Webhook dedicato (eventi degli account collegati): `https://quotes.ctrlagency.dev/api/stripe/connect/webhook`

Segreto: `STRIPE_CONNECT_WEBHOOK_SECRET` (Production). Eventi: `account.updated`, `checkout.session.completed`, `payment_intent.succeeded`. Idempotenza condivisa con `stripe_processed_events`.

Se l'API risponde che Connect non è attivo sulla piattaforma, il codice resta disponibile ma l'onboarding mostra l'errore. In Dashboard test:

1. https://dashboard.stripe.com/test/settings/connect
2. Interruttore su Test
3. Avvia Connect e accetta i termini della piattaforma
4. https://dashboard.stripe.com/test/webhooks : endpoint del Connect webhook, eventi degli account collegati
5. Copia il `whsec_…` in `STRIPE_CONNECT_WEBHOOK_SECRET` e ridistribuisci
