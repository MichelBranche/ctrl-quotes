# Backup del database di produzione

CTRL Quotes tiene il database di produzione (`ctrl-quotes-prod`, regione `aws-eu-central-1`) separato da quello di Preview (`ctrl-quotes-preview`). Il cron di Vercel `/api/cron/backup` ne fa un dump SQL completo ogni giorno verso uno store **privato** di Vercel Blob e tiene solo gli ultimi 14 file.

## Orario

La pianificazione e in UTC: `0 2 * * *` (02:00 UTC). In inverno (Europe/Rome, CET) sono le 03:00; in estate (CEST) le 04:00. L'endpoint risponde solo con `Authorization: Bearer $CRON_SECRET`, lo stesso segreto del cron outbox.

## Cosa viene salvato

Un file SQL con schema, indici, trigger (compresi quelli append-only su `audit_logs` e `quote_versions`), la tabella `__drizzle_migrations` e tutte le righe, blob inclusi. Percorso nello store: `backups/ctrl-quotes-prod/<timestamp>.sql`. Lo store e privato: l'URL non e scaricabile senza autenticazione (OIDC sul progetto, o `BLOB_READ_WRITE_TOKEN` in locale).

Un dump attuale pesa circa 70-80 KB (il file SQLite su disco e circa 2,2 MB per via delle pagine). Quattordici copie restano sotto 2 MB, ben dentro i limiti Hobby di Vercel Blob (1 GB di spazio, 10.000 operazioni semplici, 2.000 avanzate, 10 GB di trasferimento) e del piano Free di Turso (100 database, 5 GB di spazio, 500 milioni di letture e 10 milioni di scritture al mese). Su un piano Vercel Pro l'uso viene scalato dal credito incluso; a queste dimensioni il costo e trascurabile.

## Lanciare un backup a mano

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://quotes.ctrlagency.dev/api/cron/backup
```

La risposta JSON contiene `pathname`, `bytes`, `tables`, `rows` e quanti file vecchi sono stati cancellati. I log di produzione riportano le stesse cifre, non il contenuto del dump.

## Elencare e scaricare un dump

Dalla directory del progetto, autenticati con Vercel (OIDC):

```bash
vercel blob list --prefix backups/ctrl-quotes-prod/ --scope michelbranches-projects
vercel blob get backups/ctrl-quotes-prod/<file>.sql --scope michelbranches-projects > restore.sql
chmod 600 restore.sql
```

In alternativa, in uno script sul progetto collegato allo store: `list({ prefix: "backups/ctrl-quotes-prod/" })` e `get(url)` di `@vercel/blob`.

## Come ripristinare

1. Scarica il dump come sopra e tienilo in un file a permessi 600.
2. Crea un database vuoto nella stessa regione, oppure ripristina su una copia (non cancellare `ctrl-quotes-preview`):

   ```bash
   turso db create ctrl-quotes-prod-restore --group default
   turso db shell ctrl-quotes-prod-restore < restore.sql
   ```

   Se importi sullo stesso `ctrl-quotes-prod`, fai prima una copia (branch o dump) e verifica il file. Il dump inizia con `DROP ... IF EXISTS` e ricrea tabelle e trigger.
3. Controlla i conteggi delle tabelle principali, la presenza di `__drizzle_migrations` e dei quattro trigger `audit_logs_no_*` e `quote_versions_no_*`.
4. Crea un token di sola (o lettura/scrittura) per quel database: `turso db tokens create <nome>`.
5. Imposta `DATABASE_URL` (`libsql://<host>`) e `TURSO_AUTH_TOKEN` **solo** su Production, poi ridistribuisci.

Un dump di sicurezza locale, preso prima della separazione dei database, e anche in `/home/box/backups/ctrl-quotes/` (permessi 600) sulla macchina dell'assistente.

## Limiti da tenere d'occhio

- Turso Free: 100 database (Preview, Production e le copie di backup occupano ciascuno uno slot), 5 GB totali, point-in-time di 1 giorno. Non sono inclusi il ripristino dei database cancellati e gli overage automatici a pagamento: restiamo dentro il piano.
- Vercel Blob: store privato, ultimi 14 dump. Se il volume cresce (molte immagini nei Brand Kit), verifica periodicamente la dimensione del dump.
- I cron di Vercel girano solo in Production; Preview continua a usare `ctrl-quotes-preview` e non scrive su questi backup.
