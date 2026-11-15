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
