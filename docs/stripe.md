# Stripe in CTRL Quotes

Checkout e portale cliente si accendono solo se `STRIPE_SECRET_KEY` è impostata. Senza chiave, e senza le altre variabili, la pagina Abbonamento resta com'è: il pulsante apre "Pagamenti in arrivo" e non partono errori.

## Cosa si vende

- Piani **Pro** e **Business**, solo **mensile**, importi da `src/domain/plans.ts` in EUR.
- Non c'è un prezzo annuale in `plans.ts`: non è stato inventato e lo script di setup non lo crea.
- Lo Starter non si acquista: è il piano di partenza del Piano di prova.

## Variabili

- `STRIPE_SECRET_KEY` (obbligatoria per accendere i pagamenti)
- `STRIPE_WEBHOOK_SECRET` (obbligatoria per i webhook)
- `STRIPE_PRICE_PRO_MONTHLY` e `STRIPE_PRICE_BUSINESS_MONTHLY` (facoltative se esistono i lookup key)

Lookup key: `ctrl_quotes_pro_monthly`, `ctrl_quotes_business_monthly`.

## Setup

```sh
npm run stripe:setup
```

Crea in modo idempotente prodotti, prezzi mensili e la configurazione di default del Customer Portal (test o live, secondo la chiave). Ogni oggetto ha `metadata.app=ctrl-quotes`. Client, sessioni di checkout e sottoscrizioni hanno anche `workspace_id`.

Webhook: `https://quotes.ctrlagency.dev/api/stripe/webhook`

Eventi gestiti: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Gli eventi sono idempotenti (`stripe_processed_events`).

Un downgrade o una disdetta non rimuove i membri: se i posti superano il nuovo limite, si bloccano solo i nuovi inviti.
