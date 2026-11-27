"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CreditCard, Landmark, ReceiptText, Wallet } from "lucide-react";
import { SettingsFrame } from "@/components/settings/settings-frame";
import { Switch } from "@/components/data/controls";
import { useAction } from "@/components/data/use-action";
import { SelectField, TextField } from "@/components/ui/fields";
import { billingModeHint, billingModeLabel, paymentTermIds, paymentTermLabel, type BillingMode, type PaymentTermId } from "@/domain/invoicing";
import { Button } from "@/components/ui/button";
import {
  CONNECT_ENABLE_STEPS,
  paymentMethodIds,
  paymentMethodLabel,
  stripeConnectStatusLabel,
  type PaymentMethodId,
} from "@/domain/payments";
import {
  refreshStripeConnectAction,
  saveWorkspacePaymentsAction,
  startStripeConnectAction,
} from "@/server/actions/payments";
import type { WorkspacePaymentsView } from "@/server/payments";

export function PaymentsForm({
  initial,
  canEdit,
  stripeQuery,
}: {
  initial: WorkspacePaymentsView;
  canEdit: boolean;
  stripeQuery: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState(toForm(initial));
  const [baseline, setBaseline] = useState(toForm(initial));
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState(initial.stripeStatus);
  const { pending, error, setError, run } = useAction();
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);

  useEffect(() => {
    if (!canEdit) return;
    if (stripeQuery === "ritorno") {
      run(() => refreshStripeConnectAction(), (value) => {
        setStatus(value.status);
        router.replace("/app/settings/payments");
      });
    }
    if (stripeQuery === "riparti") {
      run(() => startStripeConnectAction(), (value) => {
        window.location.href = value.url;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripeQuery, canEdit]);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const toggleDefault = (id: PaymentMethodId, on: boolean) => {
    set(
      "defaultMethods",
      on ? Array.from(new Set([...values.defaultMethods, id])) : values.defaultMethods.filter((item) => item !== id),
    );
  };

  const ready = useMemo(
    () => ({
      iban: values.ibanEnabled && Boolean(values.ibanHolder.trim() && values.iban.trim()),
      paypal: values.paypalEnabled && Boolean(values.paypalValue.trim()),
      stripe: status === "active",
    }),
    [values, status],
  );

  return (
    <form
      className="pay-settings"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () =>
            saveWorkspacePaymentsAction({
              ibanEnabled: values.ibanEnabled,
              ibanHolder: values.ibanHolder,
              iban: values.iban,
              bic: values.bic,
              causaleTemplate: values.causaleTemplate,
              paypalEnabled: values.paypalEnabled,
              paypalValue: values.paypalValue,
              stripeEnabled: values.stripeEnabled && status === "active",
              defaultMethods: values.defaultMethods,
              showBeforeAcceptance: values.showBeforeAcceptance,
              billingMode: values.billingMode,
              paymentTerms: values.paymentTerms,
              paymentTermsCustom: values.paymentTerms === "custom" ? values.paymentTermsCustom : null,
            }),
          (next) => {
            setValues(toForm(next));
            setBaseline(toForm(next));
            setStatus(next.stripeStatus);
            setSaved(true);
          },
        );
      }}
    >
      <SettingsFrame
        section="payments"
        plain
        title="Pagamenti"
        subtitle="Scegli come il cliente può pagare un preventivo. I soldi arrivano sul tuo conto, non su CTRL."
        canEdit={canEdit}
        dirty={dirty}
        pending={pending}
        saved={saved}
        error={error}
      >
        <div className="ss-cols pay-cols">
          <section className="card inset form-grid">
            <h2 className="section-heading">
              <Landmark size={16} aria-hidden="true" /> Bonifico bancario
            </h2>
            <Switch
              label="Offri il bonifico"
              hint="Il cliente vede IBAN, intestatario e causale, con pulsanti per copiare."
              checked={values.ibanEnabled}
              disabled={!canEdit}
              onChange={(checked) => set("ibanEnabled", checked)}
            />
            <TextField
              label="Intestatario"
              name="ibanHolder"
              value={values.ibanHolder}
              disabled={!canEdit}
              onChange={(event) => set("ibanHolder", event.target.value)}
              autoComplete="off"
            />
            <TextField
              label="IBAN"
              name="iban"
              value={values.iban}
              disabled={!canEdit}
              onChange={(event) => set("iban", event.target.value)}
              autoComplete="off"
              spellCheck={false}
              hint={initial.ibanMasked && !dirty ? `Salvato: ${initial.ibanMasked}` : "Viene controllato il codice di controllo. Non viene mai scritto nei log."}
            />
            <TextField
              label="BIC (facoltativo)"
              name="bic"
              value={values.bic}
              disabled={!canEdit}
              onChange={(event) => set("bic", event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <TextField
              label="Causale"
              name="causale"
              value={values.causaleTemplate}
              disabled={!canEdit}
              onChange={(event) => set("causaleTemplate", event.target.value)}
              hint="Puoi usare {numero}, {titolo} e {importo}. Esempio: Preventivo {numero}."
            />
          </section>

          <section className="card inset form-grid">
            <h2 className="section-heading">
              <Wallet size={16} aria-hidden="true" /> PayPal
            </h2>
            <Switch
              label="Offri PayPal"
              hint="Il cliente apre un link paypal.me con l'importo, oppure una email precompilata."
              checked={values.paypalEnabled}
              disabled={!canEdit}
              onChange={(checked) => set("paypalEnabled", checked)}
            />
            <TextField
              label="Link paypal.me o email PayPal"
              name="paypal"
              value={values.paypalValue}
              disabled={!canEdit}
              onChange={(event) => set("paypalValue", event.target.value)}
              placeholder="paypal.me/tuonome oppure pagamenti@studio.it"
              autoComplete="off"
            />
          </section>

          <section className="card inset form-grid">
            <h2 className="section-heading">
              <CreditCard size={16} aria-hidden="true" /> Stripe Connect
            </h2>
            <p className="field-hint">
              Collega il <strong>tuo</strong> account Stripe. I pagamenti con carta vanno direttamente a te, non a CTRL. Commissione di piattaforma: 0 €.
            </p>
            <p className="pay-status">
              Stato: <strong>{stripeConnectStatusLabel[status]}</strong>
            </p>
            <Switch
              label="Offri il pagamento con carta"
              hint="Disponibile solo quando l'account Stripe è attivo."
              checked={values.stripeEnabled && status === "active"}
              disabled={!canEdit || status !== "active"}
              onChange={(checked) => set("stripeEnabled", checked)}
            />
            {canEdit ? (
              <div className="pay-connect-actions">
                <Button
                  type="button"
                  variant="secondary"
                  loading={pending}
                  onClick={() => {
                    setError(null);
                    run(() => startStripeConnectAction(), (value) => {
                      window.location.href = value.url;
                    });
                  }}
                >
                  {status === "none" ? "Collega Stripe" : status === "active" ? "Aggiorna i dati Stripe" : "Riprendi la verifica"}
                </Button>
              </div>
            ) : null}
            <details className="pay-connect-help">
              <summary>Se Stripe chiede di attivare Connect</summary>
              <ol>
                {CONNECT_ENABLE_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </details>
          </section>

          <section className="card inset form-grid">
            <h2 className="section-heading">
              <Banknote size={16} aria-hidden="true" /> Predefiniti sui preventivi
            </h2>
            <p className="field-hint">Quando invii un preventivo, queste voci sono già selezionate. Puoi cambiarle su ogni proposta.</p>
            <ul className="pay-defaults">
              {paymentMethodIds.map((id) => (
                <li key={id}>
                  <label className={!ready[id] ? "is-disabled" : undefined}>
                    <input
                      type="checkbox"
                      checked={values.defaultMethods.includes(id)}
                      disabled={!canEdit || !ready[id]}
                      onChange={(event) => toggleDefault(id, event.target.checked)}
                    />
                    {paymentMethodLabel[id]}
                  </label>
                </li>
              ))}
            </ul>
            <Switch
              label="Mostra i pagamenti anche prima dell'accettazione"
              hint="Di solito il cliente paga dopo aver accettato. Puoi mostrarli già sulla pagina pubblica."
              checked={values.showBeforeAcceptance}
              disabled={!canEdit}
              onChange={(checked) => set("showBeforeAcceptance", checked)}
            />
          </section>

          <section className="card inset form-grid">
            <h2 className="section-heading">
              <ReceiptText size={16} aria-hidden="true" /> Fatturazione B2B
            </h2>
            <p className="field-hint">
              Tra aziende di solito si paga su fattura. Scegli il comportamento predefinito dei nuovi preventivi: puoi cambiarlo su ogni proposta in «Come vuoi farti pagare».
            </p>
            <SelectField
              label="Modalità di pagamento"
              value={values.billingMode}
              disabled={!canEdit}
              onChange={(event) => set("billingMode", event.target.value === "invoice" ? "invoice" : "direct")}
              options={[
                { value: "invoice", label: billingModeLabel.invoice },
                { value: "direct", label: billingModeLabel.direct },
              ]}
            />
            <p className="field-hint">{billingModeHint[values.billingMode]}</p>
            <SelectField
              label="Termini di pagamento"
              value={values.paymentTerms ?? ""}
              disabled={!canEdit}
              onChange={(event) => {
                const next = event.target.value;
                set("paymentTerms", (paymentTermIds as readonly string[]).includes(next) ? (next as PaymentTermId) : null);
              }}
              options={[{ value: "", label: "Non indicati" }, ...paymentTermIds.map((id) => ({ value: id, label: paymentTermLabel[id] }))]}
            />
            {values.paymentTerms === "custom" ? (
              <TextField
                label="Termini personalizzati"
                name="paymentTermsCustom"
                value={values.paymentTermsCustom}
                maxLength={200}
                disabled={!canEdit}
                placeholder="Es. 30% acconto su fattura, saldo a consegna"
                onChange={(event) => set("paymentTermsCustom", event.target.value)}
              />
            ) : null}
            <p className="field-hint">I termini compaiono nelle Condizioni del preventivo, nel PDF e sulla pagina del cliente.</p>
          </section>
        </div>
      </SettingsFrame>
    </form>
  );
}

function toForm(view: WorkspacePaymentsView) {
  return {
    ibanEnabled: view.ibanEnabled,
    ibanHolder: view.ibanHolder,
    iban: view.iban,
    bic: view.bic,
    causaleTemplate: view.causaleTemplate,
    paypalEnabled: view.paypalEnabled,
    paypalValue: view.paypalMode === "me" && view.paypalValue ? `paypal.me/${view.paypalValue}` : view.paypalValue,
    stripeEnabled: view.stripeEnabled,
    defaultMethods: view.defaultMethods as PaymentMethodId[],
    showBeforeAcceptance: view.showBeforeAcceptance,
    billingMode: view.billingMode as BillingMode,
    paymentTerms: view.paymentTerms as PaymentTermId | null,
    paymentTermsCustom: view.paymentTermsCustom,
  };
}
