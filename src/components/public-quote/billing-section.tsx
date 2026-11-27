"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Pencil, ReceiptText } from "lucide-react";
import { billingModeLabel } from "@/domain/invoicing";
import { BusyMark } from "@/components/ui/async-status";
import { CopyButton } from "@/components/public-quote/payment-section";
import type { PublicBillingView } from "@/server/invoicing";

const longDate = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso : longDate.format(date);
}

export function PublicBillingSection({ token, billing }: { token: string; billing: PublicBillingView }) {
  const router = useRouter();
  const details = billing.billing;
  const [editing, setEditing] = useState(!details.submitted && !billing.invoice);
  const [holder, setHolder] = useState(details.holder);
  const [vatNumber, setVatNumber] = useState(details.vatNumber ?? "");
  const [taxCode, setTaxCode] = useState(details.taxCode ?? "");
  const [sdiOrPec, setSdiOrPec] = useState(details.sdiCode ?? details.pec ?? "");
  const [address, setAddress] = useState(details.address);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const invoice = billing.invoice;
  const isInvoiceMode = billing.billingMode === "invoice";

  async function submit() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/q/${token}/billing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holder, vatNumber, taxCode, sdiOrPec, address }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Non è stato possibile salvare i dati di fatturazione.");
        return;
      }
      setEditing(false);
      setSaved(true);
      router.refresh();
    } catch {
      setError("Connessione non riuscita. Controlla la rete e riprova.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="pq-card pq-bill" aria-label="Fatturazione">
      <span className="pq-eyebrow">Fatturazione</span>
      <h3 className="pq-bill-mode">
        <ReceiptText size={16} aria-hidden="true" /> {billingModeLabel[billing.billingMode]}
      </h3>
      <p className="pq-bill-hint">
        {invoice
          ? isInvoiceMode
            ? "La fattura è stata emessa: puoi scaricarla e procedere con il pagamento."
            : "La fattura è stata emessa: puoi scaricarla qui sotto."
          : isInvoiceMode
            ? "Conferma i dati di fatturazione: il pagamento si apre quando lo studio emette la fattura."
            : "La fattura verrà emessa a seguito del pagamento."}
      </p>
      {billing.paymentTermsText ? (
        <dl className="pq-facts pq-bill-terms">
          <div>
            <dt>Termini di pagamento</dt>
            <dd>{billing.paymentTermsText}</dd>
          </div>
        </dl>
      ) : null}

      {invoice ? (
        <div className="pq-bill-invoice" role="status">
          <span className="pq-bill-badge">
            <FileText size={14} aria-hidden="true" /> Fattura {invoice.number}
          </span>
          <dl className="pq-facts">
            <div>
              <dt>Emessa il</dt>
              <dd>{formatDate(invoice.issueDate)}</dd>
            </div>
            {invoice.dueDate ? (
              <div>
                <dt>Scadenza</dt>
                <dd>{formatDate(invoice.dueDate)}</dd>
              </div>
            ) : null}
          </dl>
          {invoice.notes ? <p className="pq-bill-notes">{invoice.notes}</p> : null}
          {billing.hasPdf ? (
            <a className="pq-btn dark block" href={`/q/${token}/invoice`} download>
              <Download size={16} aria-hidden="true" /> Scarica fattura PDF
            </a>
          ) : null}
        </div>
      ) : billing.billingStatus === "awaiting_invoice" ? (
        <p className="pq-decided" role="status">
          In attesa di fattura. {details.submitted ? "Lo studio ha ricevuto i tuoi dati e ti invierà la fattura qui." : "Conferma i dati di fatturazione qui sotto: lo studio li userà per emettere la fattura."}
        </p>
      ) : null}

      {editing ? (
        <form
          className="pq-decision-fields pq-bill-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label>
            Ragione sociale o intestatario
            <input type="text" value={holder} required minLength={2} maxLength={160} autoComplete="organization" onChange={(event) => setHolder(event.target.value)} />
          </label>
          <div className="pq-bill-pair">
            <label>
              Partita IVA
              <input type="text" value={vatNumber} maxLength={20} inputMode="text" autoComplete="off" spellCheck={false} onChange={(event) => setVatNumber(event.target.value)} />
            </label>
            <label>
              Codice Fiscale
              <input type="text" value={taxCode} maxLength={20} autoComplete="off" spellCheck={false} onChange={(event) => setTaxCode(event.target.value)} />
            </label>
          </div>
          <label>
            Codice destinatario SDI o PEC
            <input type="text" value={sdiOrPec} maxLength={160} autoComplete="off" spellCheck={false} placeholder="Es. M5UXCR1 oppure amministrazione@pec.it" onChange={(event) => setSdiOrPec(event.target.value)} />
          </label>
          <label>
            Indirizzo completo
            <textarea value={address} required minLength={8} maxLength={300} rows={2} autoComplete="street-address" placeholder="Via, numero civico, CAP, città e provincia" onChange={(event) => setAddress(event.target.value)} />
          </label>
          <p className="pq-bill-small">Indica almeno Partita IVA o Codice Fiscale. I dati vanno solo allo studio, per la fattura.</p>
          {error ? (
            <p className="pq-decision-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="pq-btn dark block" disabled={pending}>
            {pending ? <><BusyMark /> Salvataggio…</> : details.submitted ? "Aggiorna i dati di fatturazione" : "Conferma i dati di fatturazione"}
          </button>
          {details.submitted ? (
            <button type="button" className="pq-decision-cancel" disabled={pending} onClick={() => setEditing(false)}>
              Annulla
            </button>
          ) : null}
        </form>
      ) : details.submitted ? (
        <div className="pq-bill-details">
          <dl className="pq-pay-facts">
            <div>
              <dt>Intestatario</dt>
              <dd>{details.holder}</dd>
            </div>
            {details.vatNumber ? (
              <div>
                <dt>Partita IVA</dt>
                <dd>
                  {details.vatNumber}
                  <CopyButton value={details.vatNumber} label="Copia" />
                </dd>
              </div>
            ) : null}
            {details.taxCode ? (
              <div>
                <dt>Codice Fiscale</dt>
                <dd>{details.taxCode}</dd>
              </div>
            ) : null}
            {details.sdiCode || details.pec ? (
              <div>
                <dt>{details.sdiCode ? "Codice SDI" : "PEC"}</dt>
                <dd>{details.sdiCode ?? details.pec}</dd>
              </div>
            ) : null}
            <div>
              <dt>Indirizzo</dt>
              <dd>{details.address}</dd>
            </div>
          </dl>
          {saved ? <p className="pq-bill-small" role="status">Dati di fatturazione inviati allo studio.</p> : null}
          {!invoice ? (
            <button type="button" className="pq-decision-cancel pq-bill-edit" onClick={() => setEditing(true)}>
              <Pencil size={13} aria-hidden="true" /> Modifica i dati
            </button>
          ) : null}
        </div>
      ) : !invoice ? (
        <button type="button" className="pq-btn light block" onClick={() => setEditing(true)}>
          Inserisci i dati di fatturazione
        </button>
      ) : null}
    </section>
  );
}
