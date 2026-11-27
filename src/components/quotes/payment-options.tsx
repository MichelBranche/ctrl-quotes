"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banknote } from "lucide-react";
import { Switch } from "@/components/data/controls";
import { useAction } from "@/components/data/use-action";
import { SelectField, TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";
import { formatEuro } from "@/domain/money";
import { getQuotePaymentsAction, markQuotePaidAction, saveQuotePaymentsAction } from "@/server/actions/payments";
import {
  paymentMethodLabel,
  paymentStatusLabel,
  type DepositMode,
  type PaymentChoice,
  type PaymentMethodId,
  type PaymentStatus,
} from "@/domain/payments";
import type { QuotePaymentsView } from "@/server/payments";

export type PaymentOptionsValue = {
  methods: PaymentMethodId[];
  depositMode: DepositMode;
  depositBp: number | null;
  depositCents: number | null;
  showBeforeAcceptance: boolean;
};

export function toPaymentOptionsValue(view: QuotePaymentsView): PaymentOptionsValue {
  return {
    methods: view.methods,
    depositMode: view.depositMode,
    depositBp: view.depositBp,
    depositCents: view.depositCents,
    showBeforeAcceptance: view.showBeforeAcceptance,
  };
}

export function PaymentOptions({
  view,
  value,
  onChange,
  disabled,
  compact = false,
  onMarkPaid,
  markPending = false,
}: {
  view: QuotePaymentsView;
  value: PaymentOptionsValue;
  onChange: (value: PaymentOptionsValue) => void;
  disabled?: boolean;
  compact?: boolean;
  onMarkPaid?: (kind: "paid" | "deposit_paid", method: PaymentMethodId, choice: PaymentChoice) => void;
  markPending?: boolean;
}) {
  const ready = view.available.filter((item) => item.ready);
  const set = (patch: Partial<PaymentOptionsValue>) => onChange({ ...value, ...patch });
  const toggle = (id: PaymentMethodId, on: boolean) =>
    set({ methods: on ? Array.from(new Set([...value.methods, id])) : value.methods.filter((item) => item !== id) });

  if (ready.length === 0) {
    return (
      <div className="pay-options">
        <h3 className="pay-options-title">
          <Banknote size={16} aria-hidden="true" /> Come vuoi farti pagare
        </h3>
        <p className="field-hint">
          Nessun metodo di pagamento è ancora configurato.{" "}
          {view.canManageSettings ? (
            <Link href="/app/settings/payments">Apri Pagamenti nelle impostazioni</Link>
          ) : (
            "Chiedi a un amministratore di configurare bonifico, PayPal o Stripe."
          )}
        </p>
      </div>
    );
  }

  const percent = value.depositBp != null ? String(Math.round(value.depositBp / 100)) : "30";
  const amount = value.depositCents != null ? (value.depositCents / 100).toFixed(2).replace(".", ",") : "";

  return (
    <div className="pay-options">
      <h3 className="pay-options-title">
        <Banknote size={16} aria-hidden="true" /> Come vuoi farti pagare
      </h3>
      <ul className="pay-defaults">
        {ready.map((item) => (
          <li key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={value.methods.includes(item.id)}
                disabled={disabled}
                onChange={(event) => toggle(item.id, event.target.checked)}
              />
              <span>
                <strong>{paymentMethodLabel[item.id]}</strong>
                <small>{item.hint}</small>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {!compact ? (
        <>
          <SelectField
            label="Importo richiesto"
            value={value.depositMode}
            disabled={disabled}
            onChange={(event) => set({ depositMode: event.target.value as DepositMode })}
            options={[
              { value: "full", label: `Intero importo (${formatEuro(view.totalCents)})` },
              { value: "percent", label: "Acconto in percentuale" },
              { value: "amount", label: "Acconto in cifra fissa" },
            ]}
          />
          {value.depositMode === "percent" ? (
            <TextField
              label="Percentuale di acconto"
              inputMode="numeric"
              value={percent}
              disabled={disabled}
              onChange={(event) => {
                const n = Number(event.target.value.replace(/\D/g, ""));
                set({ depositBp: Number.isFinite(n) ? Math.min(100, Math.max(1, n)) * 100 : 3000 });
              }}
              hint="Tra 1 e 100."
            />
          ) : null}
          {value.depositMode === "amount" ? (
            <TextField
              label="Acconto in euro"
              inputMode="decimal"
              value={amount}
              disabled={disabled}
              onChange={(event) => {
                const raw = event.target.value.replace(",", ".");
                const n = Number(raw);
                set({ depositCents: Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0 });
              }}
            />
          ) : null}
          <Switch
            label="Mostra i pagamenti anche prima dell'accettazione"
            checked={value.showBeforeAcceptance}
            disabled={disabled}
            onChange={(checked) => set({ showBeforeAcceptance: checked })}
          />
        </>
      ) : null}
      {view.paymentStatus !== "none" ? (
        <p className="pay-status">
          Stato: <strong>{paymentStatusLabel[view.paymentStatus as PaymentStatus]}</strong>
          {view.amountPaidCents > 0 ? ` · ${formatEuro(view.amountPaidCents)}` : null}
        </p>
      ) : null}
      {onMarkPaid && view.paymentStatus !== "paid" && view.markChoices.length > 0 && value.methods.some((id) => id === "iban" || id === "paypal") ? (
        <div className="pay-connect-actions">
          {(["iban", "paypal"] as const).flatMap((method) =>
            value.methods.includes(method)
              ? view.markChoices.map((item) => (
                  <Button
                    key={`${method}-${item.choice}`}
                    type="button"
                    variant="secondary"
                    loading={markPending}
                    disabled={disabled}
                    onClick={() => onMarkPaid(item.kind, method, item.choice)}
                  >
                    {item.choice === "deposit"
                      ? `Segna l'acconto come pagato (${method === "iban" ? "bonifico" : "PayPal"}, ${formatEuro(item.amountCents)})`
                      : item.choice === "balance"
                        ? `Segna il saldo come pagato (${method === "iban" ? "bonifico" : "PayPal"}, ${formatEuro(item.amountCents)})`
                        : `Segna il totale come pagato (${method === "iban" ? "bonifico" : "PayPal"}, ${formatEuro(item.amountCents)})`}
                  </Button>
                ))
              : [],
          )}
        </div>
      ) : null}
    </div>
  );
}


export function QuotePaymentsPanel({
  quoteId,
  disabled,
  compact = false,
  showMarkPaid = false,
}: {
  quoteId: string;
  disabled?: boolean;
  compact?: boolean;
  showMarkPaid?: boolean;
}) {
  const [view, setView] = useState<QuotePaymentsView | null>(null);
  const [value, setValue] = useState<PaymentOptionsValue | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { pending, run } = useAction();

  useEffect(() => {
    let cancelled = false;
    getQuotePaymentsAction(quoteId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setView(result.value);
        setValue(toPaymentOptionsValue(result.value));
      } else setLoadError(result.message);
    }).catch(() => !cancelled && setLoadError("Connessione non riuscita. Controlla la rete e riprova."));
    return () => {
      cancelled = true;
    };
  }, [quoteId]);

  if (loadError) return <p className="field-hint">{loadError}</p>;
  if (!view || !value) return <p className="field-hint">Carico i metodi di pagamento…</p>;

  function persist(next: PaymentOptionsValue) {
    setValue(next);
    run(
      () => saveQuotePaymentsAction(quoteId, next),
      (updated) => {
        setView(updated);
        setValue(toPaymentOptionsValue(updated));
      },
    );
  }

  return (
    <PaymentOptions
      view={view}
      value={value}
      onChange={persist}
      disabled={disabled || pending}
      compact={compact}
      markPending={pending}
      onMarkPaid={
        showMarkPaid
          ? (kind, method) => {
              run(
                () => markQuotePaidAction(quoteId, { kind, method }),
                () => {
                  run(() => getQuotePaymentsAction(quoteId), (updated) => {
                    if (updated) {
                      setView(updated);
                      setValue(toPaymentOptionsValue(updated));
                    }
                  });
                },
              );
            }
          : undefined
      }
    />
  );
}
