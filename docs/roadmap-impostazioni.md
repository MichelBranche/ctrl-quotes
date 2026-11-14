# Roadmap Impostazioni

La pagina indice `/app/settings` è una griglia di card verso le sezioni vere. Il form del profilo è passato a
`/app/settings/profile` (anche nel menu laterale delle impostazioni).

| Card | Rotta | Stato |
|---|---|---|
| Profilo workspace | /app/settings/profile | disponibile (nome workspace) |
| Brand Kit | /app/settings/brand | disponibile |
| Fiscale e IVA | /app/settings/fiscal | disponibile |
| Team e ruoli | /app/settings/team | disponibile (gli inviti via email sono ancora disattivati) |
| Fatturazione | /app/settings/billing | disponibile (piani; pagamenti in arrivo, Fase 5) |

Nessuna card è "In arrivo": tutte le rotte esistono.

## Da fare
- Profilo workspace: descrizione e preferenze generali citate nella card non esistono ancora (oggi solo il nome).
- Fatturazione: metodi di pagamento e storico fatture arrivano con Stripe (Fase 5).

## Immagini decorative di Team e ruoli
Volti stock, decorativi (alt vuoto, aria-hidden), non sono membri reali del workspace.
Fonte: Unsplash, licenza Unsplash (https://unsplash.com/license): uso gratuito anche commerciale, senza attribuzione obbligatoria.
- `public/settings/avatar-1.webp`: https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d
- `public/settings/avatar-2.webp`: https://images.unsplash.com/photo-1494790108377-be9c29b29330
- `public/settings/avatar-3.webp`: https://images.unsplash.com/photo-1500648767791-00dcc994a43e
