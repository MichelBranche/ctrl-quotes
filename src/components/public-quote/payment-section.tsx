"use client";

import { useState } from "react";
import { Check, Copy, CreditCard, Landmark, Wallet } from "lucide-react";
import { formatEuro } from "@/domain/money";
import { paymentStatusLabel, type PublicPaymentView } from "@/domain/payments";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="pq-pay-copy"
      onClick={async () => {
        const ok = await copyText(value);
        if (ok) {
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        }
      }}
    >
      {done ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {done ? "Copiato" : label}
    </button>
  );
}

export function PublicPaymentSection({ token, payment }: { token: string; payment: PublicPaymentView }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const paid = payment.status === "paid";
  const dueLabel = payment.isDeposit ? "Acconto richiesto" : "Importo da pagare";

  async function payWithCard() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/q/${token}/pay`, { method: "POST" });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) {
        setError(body.error ?? "Non è stato possibile aprire il pagamento con carta.");
        return;
      }
      window.location.href = body.url;
    } catch {
      setError("Connessione non riuscita. Controlla la rete e riprova.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="pq-card pq-pay" aria-label="Pagamento">
      <span className="pq-eyebrow">{paid ? "Pagamento" : dueLabel}</span>
      <p className="pq-total">
        {formatEuro(paid ? payment.amountPaidCents || payment.amountDueCents : payment.amountDueCents)}
        {payment.isDeposit && !paid ? <small>su un totale di {formatEuro(payment.totalCents)}</small> : null}
      </p>
      {paid ? (
        <p className="pq-decided" role="status">
          {paymentStatusLabel.paid}. Grazie.
        </p>
      ) : payment.status === "deposit_paid" ? (
        <p className="pq-decided" role="status">
          {paymentStatusLabel.deposit_paid} ({formatEuro(payment.amountPaidCents)}).
        </p>
      ) : null}

      {!paid && payment.iban ? (
        <div className="pq-pay-method">
          <h3>
            <Landmark size={16} aria-hidden="true" /> Bonifico bancario
          </h3>
          <dl className="pq-pay-facts">
            <div>
              <dt>Intestatario</dt>
              <dd>
                {payment.iban.holder}
                <CopyButton value={payment.iban.holder} label="Copia" />
              </dd>
            </div>
            <div>
              <dt>IBAN</dt>
              <dd>
                <span className="pq-pay-iban">{payment.iban.ibanGrouped}</span>
                <CopyButton value={payment.iban.iban} label="Copia IBAN" />
              </dd>
            </div>
            {payment.iban.bic ? (
              <div>
                <dt>BIC</dt>
                <dd>
                  {payment.iban.bic}
                  <CopyButton value={payment.iban.bic} label="Copia" />
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Causale</dt>
              <dd>
                {payment.causale}
                <CopyButton value={payment.causale} label="Copia causale" />
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {!paid && payment.paypal ? (
        <a className="pq-btn dark block pq-pay-btn" href={payment.paypal.href} target="_blank" rel="noopener noreferrer">
          <Wallet size={16} aria-hidden="true" /> {payment.paypal.label}
        </a>
      ) : null}

      {!paid && payment.stripe?.available !== false && payment.methods.includes("stripe") ? (
        <button type="button" className="pq-btn dark block pq-pay-btn" onClick={() => void payWithCard()} disabled={pending}>
          <CreditCard size={16} aria-hidden="true" /> {pending ? "Apro Stripe…" : "Paga con carta"}
        </button>
      ) : null}
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
