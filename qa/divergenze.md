# Divergenze visive rispetto ai mockup

Confronto fra gli screenshot Playwright (desktop 1440 e mobile 375) e gli 11 mockup. Le pagine operative sono volutamente vuote: i dati dei mockup non sono fixture.

## Fedeli nella struttura

- Login e registrazione: card centrale, sfondo a curve calde in CSS, titolo serif, campi con icona, CTA nera a pillola, divisore "oppure", link tra accedi e registrati.
- Shell: sidebar chiara, voce attiva viola tenue, topbar con periodo, campanella e avatar, card Piano Pro scura.
- Mobile: menu a icona, niente sidebar fissa, nessun scroll orizzontale a 320 px.
- Token: neutri chiari, accento viola, bordi sottili, raggi morbidi, ombre leggere, Inter e Instrument Serif (OFL, via `next/font`).

## Divergenze volute

1. Logo: SVG segnaposto con Q e spunta (`data-placeholder="true"`), non l'icona a F dei mockup di sidebar e login. Il file logo raster non è un SVG licenziato.
2. Sfondo auth: gradienti e curve CSS, non la foto astratta dei mockup. Nessuna immagine con licenza non chiara.
3. Nessun dato personale dei mockup (nome, email, P.IVA). L'account di QA è Giulia Neri, `giulia.neri@example.com`, workspace Studio Esempio.
4. Overview, Preventivi, Clienti, Catalogo, Template e Brand Kit sono stati vuoti. I KPI, le tabelle e le anteprime piene arrivano con i dati reali.
5. "Nuovo preventivo", "Nuovo cliente", "Nuovo elemento" e "Gestisci piano" sono disabilitati e spiegano che la funzione arriva dopo. Non sono pulsanti finti.
6. Il selettore "Ultimi 30 giorni" è visibile ma inattivo: non filtra nulla finché non ci sono metriche.
7. Team è nascosto sul piano Free, come da specifica (visibile solo se il piano lo abilita). Fatturazione è in sidebar ma disabilitata.
8. Integrazioni e API, presenti nel mockup Impostazioni, non sono in navigazione: sono fuori dalla v1.
9. La campanella non ha il pallino rosso: non ci sono notifiche finte. Il popover dice "Nessuna notifica".
10. Google è un pulsante disabilitato con spiegazione finché mancano le credenziali. Il marchio Google a quattro colori non è incorporato: c'è la lettera G.
11. Il saluto usa l'ora di Europe/Rome e il nome dell'account, non la dicitura fissa del mockup.
12. Dark mode: i token esistono sotto `[data-theme="dark"]` ma l'app resta chiara.
