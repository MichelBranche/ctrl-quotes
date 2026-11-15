# CTRL® Quotes

SaaS italiano per preventivi interattivi. Questa repository contiene la **Fase 1** (fondamenta, autenticazione, isolamento dei workspace, design system) e la **Fase 2** (dati operativi: clienti, catalogo, Brand Kit, template, impostazioni, ruoli).

Il prodotto non è in produzione. Non creare database o progetti Vercel da questa fase senza una decisione esplicita del proprietario.

## Requisiti locali

- Node.js 22
- Nessun account cloud. Il database di sviluppo è un file libSQL.

```bash
npm install
npm run dev
```

Apri `http://localhost:3000`. Senza variabili d'ambiente l'app usa `data/local.db`, scrive un secret di sviluppo in `data/dev-secret` e stampa le email in console.

## Script

| Script | Uso |
| --- | --- |
| `npm run dev` | Server di sviluppo |
| `npm run build` / `npm start` | Build e server di produzione locale |
| `npm run typecheck` | TypeScript strict |
| `npm run lint` | ESLint |
| `npm test` | Vitest: prezzi, auth, isolamento tenant, audit, outbox, clienti, catalogo, impostazioni, import CSV, permessi |
| `npm run test:e2e` | Playwright, screenshot in `qa/screenshots` (Fase 2 in `qa/screenshots/fase2`, o nella cartella `QA_SHOTS_DIR`) |
| `npm run db:migrate` | Applica le migrazioni in `drizzle/`. Idempotente. `next build` non le esegue: al runtime le applica la prima richiesta, dopo il confine dinamico |

## Variabili d'ambiente

Vedi `.env.example`. In locale sono tutte opzionali.

Prima di un deploy di anteprima il proprietario deve creare, su account dedicati e **non** condivisi con CTRL Admin o Agenda Easy:

- progetto Vercel separato, regione `fra1` se possibile, dominio temporaneo `*.vercel.app`
- `BETTER_AUTH_SECRET` (almeno 32 caratteri) e `BETTER_AUTH_URL` solo nell'ambiente Production; in Preview lasciare `BETTER_AUTH_URL` vuoto
- database Turso **nuovo** (`DATABASE_URL`, `TURSO_AUTH_TOKEN`)
- Resend (`RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_DRIVER=resend`) quando si inviano email vere
- In Preview (`VERCEL_ENV=preview`) l'email è confermata in automatico, perché il driver `console` non recapita il link. In Production la conferma resta obbligatoria, anche se `PREVIEW_AUTO_VERIFY_EMAIL=1`
- opzionale: Google OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- opzionale ma consigliato in produzione: Upstash Redis (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) per il rate limit condiviso
- `CRON_SECRET` per `GET /api/cron/outbox`
- più avanti: Vercel Blob privato (`BLOB_READ_WRITE_TOKEN`). Per ora il logo del Brand Kit (massimo 1 MB) è salvato nel database, tabella `asset_blobs`, e servito da `/api/assets/[id]` solo ai membri del workspace

Non attivare `ENABLE_COMPONENT_CATALOG` né `ENABLE_DEV_MAILBOX` su Vercel: le route di sviluppo rispondono 404 se `VERCEL` è impostato.

## Cosa c'è in questa fase

- Auth email e password: registrazione, verifica email, login, logout, reset. Google è collegato solo se le credenziali ci sono.
- Email dietro un'interfaccia: driver `console`, `file` e `resend`.
- Workspace creato al primo accesso, ruoli owner / admin / member, ogni lettura di dominio richiede `workspaceId`.
- Schema SQL versionato in `drizzle/0000_init.sql`, incluse le tabelle delle fasi successive, con trigger che rendono immutabili `audit_logs` e `quote_versions`.
- Shell, token in `src/styles/tokens.css`, motion con `prefers-reduced-motion`, pagine vuote oneste, catalogo in `/dev/components`.

## Fase 2: dati operativi

- **Clienti**: creazione, modifica, archivio e ripristino, eliminazione (solo admin), referenti, note interne, ricerca e filtri per stato e tipo, paginazione.
- **Import CSV clienti** (admin): separatore `;` `,` o tab, mapping delle colonne con sinonimi italiani, anteprima, doppioni per email, P.IVA o nome, errori per riga. Massimo 1 MB e 1000 righe. Il server ripete parsing e validazione.
- **Catalogo**: servizi, prodotti e pacchetti, categorie, prezzi in centesimi con aliquote IVA 22, 10, 5, 4 e 0% (con natura), ricorrenza una tantum, mensile o annuale. Il calcolo usa `priceQuote`, lo stesso motore dei preventivi. Un elemento usato in un pacchetto non si elimina.
- **Brand Kit**: logo PNG, JPG o SVG (SVG con script o riferimenti esterni rifiutati), colori con verifica del contrasto, font, dati aziendali inseriti dall'utente.
- **Template**: preferiti e template predefinito (vedi «Template premium»).
- **Impostazioni**: regime fiscale, IVA e prezzi predefiniti, formato della numerazione e azzeramento (solo preferenza), validità e condizioni, team e ruoli.
- **Ruoli** verificati sul server per ogni azione: `src/domain/permissions.ts`.
- Migrazione additiva `drizzle/0001_fase2_dati_operativi.sql`.

## Template premium

- Cinque template su tre pagine A4: **Swiss Minimal** (`minimal`), **Studio Editorial** (`studio`), **Editorial Atelier** (`editorial`), **Corporate Executive** (`corporate`), **Bold Impact** (`bold`). Nomi e descrizioni vivono nel codice (`src/domain/templates.ts`).
- Un solo sorgente per template (`src/components/quote-render/templates/`) disegnato con un kit comune: `webKit` per anteprima ed editor, `pdfKit` per il PDF vettoriale. Le animazioni esistono solo sul web e rispettano `prefers-reduced-motion`.
- Per ogni preventivo: foto di copertina tra quelle del template (o la foto caricata), colore d'accento del template, del Brand Kit o personalizzato, con verifica del contrasto. L'arco di Bold è un SVG che segue l'accento.
- Font liberi incorporati con licenza OFL: Inter, Cormorant Garamond, Archivo Black, Instrument Serif (cifre).
- Le miniature della libreria e dell'editor sono render veri con contenuti di esempio e il nome e il logo del workspace.
- Migrazione additiva `drizzle/0003_template_premium.sql`: aggiunge solo `tpl_studio`. Le chiavi esistenti restano, quindi i preventivi già salvati si aprono con il nuovo stile del template corrispondente.
- QA: `/dev/templates?t=<chiave>` (solo con `ENABLE_COMPONENT_CATALOG=1`, mai su Vercel) mostra il preventivo di esempio per controllare il layout mobile. `scripts/qa-compare.py` affianca le pagine PDF ai mockup.

## Pagamenti (Stripe)

Checkout e portale cliente si accendono solo se `STRIPE_SECRET_KEY` è impostata. Senza chiave la pagina Abbonamento resta com'è. Dettagli in `docs/stripe.md`.
