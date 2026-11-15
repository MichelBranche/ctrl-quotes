"use client";

import { useState, useTransition } from "react";
import { AuthScreen } from "@/components/auth/auth-screen";
import { AuthSubmit } from "@/components/auth/auth-submit";
import { acceptTrialAction } from "@/server/actions/onboarding";

export function TrialAcceptScreen() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthScreen>
      <h1>Riscatta i tuoi 7 giorni gratuiti</h1>
      <p className="lede">
        Inizia subito con i limiti del piano Starter, senza carta. Alla fine dei sette giorni puoi attivare un abbonamento per continuare a lavorare. I dati restano al sicuro.
      </p>
      {error ? <p className="alert" role="alert">{error}</p> : null}
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          start(async () => {
            try {
              await acceptTrialAction();
            } catch (err) {
              if (err && typeof err === "object" && "digest" in err) throw err;
              setError("Non è stato possibile avviare la prova. Riprova.");
            }
          });
        }}
      >
        <AuthSubmit loading={pending}>Accetta e continua</AuthSubmit>
      </form>
    </AuthScreen>
  );
}
