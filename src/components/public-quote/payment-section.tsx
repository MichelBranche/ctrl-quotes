"use client";

import { useMemo, useState } from "react";
import { Check, Copy, CreditCard, Landmark, Wallet } from "lucide-react";
import { formatEuro } from "@/domain/money";
import { paymentStatusLabel, type PaymentChoice, type PublicPaymentView } from "@/domain/payments";
import { BusyMark } from "@/components/ui/async-status";

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
  const [choice, setChoice] = useState<PaymentChoice | null>(payment.options[0]?.choice ?? null);
  const paid = payment.status === "paid";
  const selected = useMemo(
    () => payment.options.find((option) => option.choice === choice) ?? payment.options[0] ?? null,
    [payment.options, choice],
  );

  async function payWithCard(next: PaymentChoice) {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/q/${token}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice: next }),
      });
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

  const amount = selected?.amountCents ?? payment.amountDueCents;
  const causale = selected?.causale ?? payment.causale;
  const paypal = selected?.paypal ?? payment.paypal;

  return (
    <section className="pq-card pq-pay" aria-label="Pagamento">
      <span className="pq-eyebrow">{paid ? "Pagamento" : selected?.label ?? (payment.isDeposit ? "Acconto richiesto" : "Importo da pagare")}</span>
      <p className="pq-total">
        {formatEuro(paid ? payment.amountPaidCents || payment.totalCents : amount)}
        {!paid && selected?.hint ? <small>{selected.hint}</small> : null}
      </p>
      {paid ? (
        <p className="pq-decided" role="status">
          {paymentStatusLabel.paid}. Grazie.
        </p>
      ) : payment.status === "deposit_paid" ? (
        <p className="pq-decided" role="status">
          {paymentStatusLabel.deposit_paid} ({formatEuro(payment.amountPaidCents)}). Resta da pagare {formatEuro(payment.amountDueCents)}.
        </p>
      ) : null}

      {!paid && payment.options.length > 1 ? (
        <div className="pq-pay-choices" role="radiogroup" aria-label="Importo da pagare">
          {payment.options.map((option) => (
            <button
              key={option.choice}
              type="button"
              role="radio"
              aria-checked={selected?.choice === option.choice}
              className={selected?.choice === option.choice ? "pq-pay-choice is-selected" : "pq-pay-choice"}
              onClick={() => setChoice(option.choice)}
            >
              <strong>{option.label}</strong>
              <span>{formatEuro(option.amountCents)}</span>
              {option.hint ? <small>{option.hint}</small> : null}
            </button>
          ))}
        </div>
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
              <dt>Importo</dt>
              <dd>
                {formatEuro(amount)}
                <CopyButton value={(amount / 100).toFixed(2).replace(".", ",")} label="Copia importo" />
              </dd>
            </div>
            <div>
              <dt>Causale</dt>
              <dd>
                {causale}
                <CopyButton value={causale} label="Copia causale" />
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {!paid && paypal ? (
        <a className="pq-btn dark block pq-pay-btn" href={paypal.href} target="_blank" rel="noopener noreferrer">
          <Wallet size={16} aria-hidden="true" /> {paypal.label}
        </a>
      ) : null}

      {!paid && payment.stripe?.available !== false && payment.methods.includes("stripe") && selected ? (
        <button type="button" className="pq-btn dark block pq-pay-btn" onClick={() => void payWithCard(selected.choice)} disabled={pending}>
          {pending ? <BusyMark /> : <CreditCard size={16} aria-hidden="true" />} {pending ? "Apro Stripe…" : selected.label}
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
