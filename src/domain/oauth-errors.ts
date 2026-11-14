/** Italian text for the error codes Better Auth (and Google) put in ?error= after a failed social sign-in. */
const known: Record<string, string> = {
  access_denied: "Accesso con Google annullato. Puoi riprovare o usare email e password.",
  account_not_linked:
    "Esiste già un account con questa email. Accedi con email e password: Google si collega solo se l'email è verificata su entrambi.",
  email_not_verified: "Google non conferma questa email come verificata, quindi non possiamo collegarla. Accedi con email e password.",
  email_not_found: "Google non ha condiviso un indirizzo email. Riprova o usa email e password.",
  state_mismatch: "La sessione di accesso è scaduta. Riprova da questa pagina.",
  state_not_found: "La sessione di accesso è scaduta. Riprova da questa pagina.",
  state_security_mismatch: "La sessione di accesso è scaduta. Riprova da questa pagina.",
  please_restart_the_process: "La sessione di accesso è scaduta. Riprova da questa pagina.",
  account_already_linked_to_different_user: "Questo account Google è già collegato a un altro utente.",
  oauth_provider_not_found: "L'accesso con Google non è disponibile al momento.",
  signup_disabled: "Le nuove registrazioni con Google non sono disponibili al momento.",
};

const generic = "Accesso con Google non riuscito. Riprova o usa email e password.";

export function oauthErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  const key = code.trim().toLowerCase().replace(/[\s-]+/g, "_").slice(0, 80);
  if (!key) return null;
  return known[key] ?? generic;
}
