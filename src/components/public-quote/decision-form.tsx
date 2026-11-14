"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { ACCEPT_CONSENT } from "@/domain/quote-consent";
import { decidePublicQuoteAction } from "@/server/actions/public-decision";

const longDate = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });

export function PublicDecisionForm({
  token,
  status,
  decidedAt,
  defaultName,
  defaultEmail,
}: {
  token: string;
  status: string;
  decidedAt: string | null;
  defaultName: string;
  defaultEmail: string;
}) {
  const [decision, setDecision] = useState<"accepted" | "rejected" | null>(null);
  const [signerName, setSignerName] = useState(defaultName);
  const [signerEmail, setSignerEmail] = useState(defaultEmail);
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"accepted" | "rejected" | null>(status === "accepted" || status === "rejected" ? status : null);
  const [doneAt, setDoneAt] = useState<string | null>(decidedAt);
  const [pending, start] = useTransition();

  if (done) {
    const when = doneAt ? longDate.format(new Date(doneAt)) : null;
    return (
      <p className="pq-decided" role="status">
        {done === "accepted" ? "Hai accettato questo preventivo" : "Hai rifiutato questo preventivo"}
        {when ? ` il ${when}` : ""}.
      </p>
    );
  }

  function submit(next: "accepted" | "rejected") {
    setError(null);
    start(async () => {
      const result = await decidePublicQuoteAction(token, {
        decision: next,
        signerName,
        signerEmail,
        note: next === "rejected" ? note : undefined,
        consent: next === "accepted" ? consent : true,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDone(result.status === "accepted" ? "accepted" : "rejected");
      setDoneAt(typeof result.decidedAt === "string" ? result.decidedAt : result.decidedAt.toISOString());
    });
  }

  return (
    <form className="pq-decision" onSubmit={(event) => event.preventDefault()}>
      <div className="pq-decision-acts">
        <button type="button" className="pq-btn dark block" disabled={pending} onClick={() => setDecision("accepted")}>
          <Check size={16} aria-hidden="true" /> Accetta
        </button>
        <button type="button" className="pq-btn light block" disabled={pending} onClick={() => setDecision("rejected")}>
          <X size={16} aria-hidden="true" /> Rifiuta
        </button>
      </div>
      {decision ? (
        <div className="pq-decision-fields">
          <label>
            Nome e cognome
            <input type="text" name="signerName" value={signerName} autoComplete="name" required minLength={2} maxLength={80} onChange={(event) => setSignerName(event.target.value)} />
          </label>
          <label>
            Email
            <input type="email" name="signerEmail" value={signerEmail} autoComplete="email" required onChange={(event) => setSignerEmail(event.target.value)} />
          </label>
          {decision === "rejected" ? (
            <label>
              Motivo (facoltativo)
              <textarea name="note" value={note} maxLength={1000} rows={3} onChange={(event) => setNote(event.target.value)} />
            </label>
          ) : (
            <label className="pq-consent">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>{ACCEPT_CONSENT}</span>
            </label>
          )}
          {error ? (
            <p className="pq-decision-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className={decision === "accepted" ? "pq-btn dark block" : "pq-btn light block"}
            disabled={pending || (decision === "accepted" && !consent)}
            onClick={() => submit(decision)}
          >
            {pending ? "Invio in corso..." : decision === "accepted" ? "Conferma accettazione" : "Conferma rifiuto"}
          </button>
          <button type="button" className="pq-decision-cancel" disabled={pending} onClick={() => setDecision(null)}>
            Annulla
          </button>
        </div>
      ) : null}
    </form>
  );
}
