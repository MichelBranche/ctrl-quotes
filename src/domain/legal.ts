/** Company and cookie facts used by the public legal pages. No invented VAT or address. */
export const legalPlaceholders = {
  vat: "[DA COMPLETARE: partita IVA]",
  address: "[DA COMPLETARE: sede legale]",
  privacyEmail: "[DA COMPLETARE: email per richieste privacy]",
} as const;

export const legalOperator = {
  product: "CTRL Quotes",
  operator: "CTRL Agency",
  owner: "Michel Branche",
  site: "ctrlagency.dev",
  appHost: "quotes.ctrlagency.dev",
  updated: "15 novembre 2026",
} as const;

export type CookieKind = "tecnico";

export type CookieEntry = {
  name: string;
  purpose: string;
  duration: string;
  kind: CookieKind;
  setBy: string;
};

/** Cookies this app sets itself. Third-party technical cookies are described in the privacy page, not listed here. */
export const ownCookies: CookieEntry[] = [
  {
    name: "better-auth.session_token (su HTTPS: __Secure-better-auth.session_token)",
    purpose: "Mantiene la sessione di accesso. HttpOnly, SameSite Lax, Secure su HTTPS.",
    duration: "Fino alla scadenza della sessione (gestita da Better Auth).",
    kind: "tecnico",
    setBy: "CTRL Quotes (Better Auth)",
  },
  {
    name: "cq_workspace",
    purpose: "Ricorda quale workspace è attivo. HttpOnly, SameSite Lax, Secure su HTTPS. Contiene solo l'identificativo del workspace.",
    duration: "12 mesi",
    kind: "tecnico",
    setBy: "CTRL Quotes",
  },
  {
    name: "cq_invite",
    purpose: "Ricorda il token di un invito al team mentre accedi o ti registri, così puoi accettarlo dopo il login. HttpOnly, SameSite Lax, Secure su HTTPS. Contiene solo il token dell'invito.",
    duration: "7 giorni, o fino all'accettazione o alla scadenza dell'invito.",
    kind: "tecnico",
    setBy: "CTRL Quotes",
  },
];

export const localPreferences = [
  {
    name: "cq-sidebar-collapsed",
    purpose: "Memorizza se la barra laterale è compatta. Non è un cookie e non è usato per profilazione.",
    setBy: "CTRL Quotes (localStorage del browser)",
  },
] as const;
