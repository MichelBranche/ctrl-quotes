"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Download, FileUp, ReceiptText, Trash2 } from "lucide-react";
import { useAction } from "@/components/data/use-action";
import { TextAreaField } from "@/components/data/fields";
import { TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";
import { INVOICE_PDF_MAX_BYTES, billingModeLabel, billingStatusLabel, suggestedDueDate } from "@/domain/invoicing";
import {
  getQuoteInvoiceAction,
  removeQuoteInvoicePdfAction,
  reopenQuoteInvoiceAction,
  saveQuoteInvoiceAction,
} from "@/server/actions/payments";
import type { StudioInvoiceView } from "@/server/invoicing";

const longDate = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
const dateTime = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome" });

function formatDate(iso: string | null): string {
  if (!iso) return "Non indicata";
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso : longDate.format(date);
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="pq-pay-copy"
      aria-label={`Copia ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        } catch {
          toast.error("Copia non riuscita.");
        }
      }}
    >
      {done ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      {done ? "Copiato" : "Copia"}
    </button>
  );
}

type Form = { number: string; issueDate: string; dueDate: string; notes: string };

function formFrom(view: StudioInvoiceView): Form {
  return {
    number: view.invoice?.number ?? "",
    issueDate: view.invoice?.issueDate ?? view.today,
    dueDate: view.invoice?.dueDate ?? view.suggestedDueDate ?? "",
    notes: view.invoice?.notes ?? "",
  };
}

/**
 * Studio side of B2B billing: the billing details the client sent (with copy buttons) and the
 * "Emetti / Allega fattura" form: number, dates, notes and the optional PDF.
 */
export function QuoteInvoicePanel({ quoteId, disabled, onChanged }: { quoteId: string; disabled?: boolean; onChanged?: () => void }) {
  const [view, setView] = useState<StudioInvoiceView | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { pending, error, run } = useAction();

  useEffect(() => {
    let cancelled = false;
    getQuoteInvoiceAction(quoteId)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setView(result.value);
          setForm(formFrom(result.value));
        } else setLoadError(result.message);
      })
      .catch(() => !cancelled && setLoadError("Connessione non riuscita. Controlla la rete e riprova."));
    return () => {
      cancelled = true;
    };
  }, [quoteId]);

  if (loadError) return <p className="field-hint">{loadError}</p>;
  if (!view || !form) return <p className="field-hint">Carico la fatturazione…</p>;

  const apply = (next: StudioInvoiceView) => {
    setView(next);
    setForm(formFrom(next));
    setEditing(false);
    onChanged?.();
  };

  async function upload(file: File) {
    if (file.size > INVOICE_PDF_MAX_BYTES) {
      toast.error("Il PDF della fattura può pesare al massimo 4 MB.");
      return;
    }
    if (file.type && file.type !== "application/pdf") {
      toast.error("Carica un file PDF.");
      return;
    }
    setUploading(true);
    try {
      const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/pdf", "X-Filename": encodeURIComponent(file.name) },
        body: file,
      });
      const body = (await response.json().catch(() => ({}))) as { value?: StudioInvoiceView; error?: string };
      if (!response.ok || !body.value) {
        toast.error(body.error ?? "Caricamento non riuscito. Riprova.");
        return;
      }
      toast.success("PDF della fattura caricato.");
      setView(body.value);
      onChanged?.();
    } catch {
      toast.error("Connessione non riuscita. Controlla la rete e riprova.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const billing = view.billing;
  const issued = view.invoiceStatus === "issued" && view.invoice;
  const showForm = !issued || editing;
  const busy = disabled || pending || uploading;
  const statusClass = view.billingStatus === "awaiting_invoice" ? "inv-badge is-waiting" : view.billingStatus === "invoice_issued" ? "inv-badge is-issued" : "inv-badge";

  return (
    <section className="inv-panel" aria-label="Fatturazione">
      <div className="inv-panel-head">
        <h3 className="pay-options-title">
          <ReceiptText size={16} aria-hidden="true" /> Emetti / Allega fattura
        </h3>
        <span className={statusClass}>{billingStatusLabel[view.billingStatus] || billingModeLabel[view.billingMode]}</span>
      </div>
      <p className="field-hint">
        {billingModeLabel[view.billingMode]}
        {view.paymentTermsText ? ` · Termini: ${view.paymentTermsText}` : ""}
      </p>

      {billing ? (
        <dl className="inv-facts" aria-label="Dati di fatturazione del cliente">
          <div>
            <dt>Intestatario</dt>
            <dd>
              {billing.holder}
              <CopyValue value={billing.holder} label="intestatario" />
            </dd>
          </div>
          {billing.vatNumber ? (
            <div>
              <dt>Partita IVA</dt>
              <dd>
                {billing.vatNumber}
                <CopyValue value={billing.vatNumber} label="Partita IVA" />
              </dd>
            </div>
          ) : null}
          {billing.taxCode ? (
            <div>
              <dt>Codice Fiscale</dt>
              <dd>
                {billing.taxCode}
                <CopyValue value={billing.taxCode} label="Codice Fiscale" />
              </dd>
            </div>
          ) : null}
          {billing.sdiCode ? (
            <div>
              <dt>Codice SDI</dt>
              <dd>
                {billing.sdiCode}
                <CopyValue value={billing.sdiCode} label="codice SDI" />
              </dd>
            </div>
          ) : null}
          {billing.pec ? (
            <div>
              <dt>PEC</dt>
              <dd>
                {billing.pec}
                <CopyValue value={billing.pec} label="PEC" />
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Indirizzo</dt>
            <dd>
              {billing.address}
              <CopyValue value={billing.address} label="indirizzo" />
            </dd>
          </div>
          {billing.submittedAt ? (
            <div>
              <dt>Inviati il</dt>
              <dd>{dateTime.format(new Date(billing.submittedAt))}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="field-hint">
          {view.accepted
            ? "Il cliente non ha ancora inviato i dati di fatturazione dal link del preventivo. Puoi comunque registrare la fattura."
            : "Dopo l'accettazione il cliente conferma qui i dati di fatturazione (P.IVA, CF, SDI o PEC, indirizzo)."}
        </p>
      )}

      {issued && !editing ? (
        <dl className="inv-facts" aria-label="Fattura emessa">
          <div>
            <dt>Numero</dt>
            <dd>{view.invoice?.number}</dd>
          </div>
          <div>
            <dt>Emessa il</dt>
            <dd>{formatDate(view.invoice?.issueDate ?? null)}</dd>
          </div>
          <div>
            <dt>Scadenza</dt>
            <dd>{formatDate(view.invoice?.dueDate ?? null)}</dd>
          </div>
          {view.invoice?.notes ? (
            <div>
              <dt>Note</dt>
              <dd>{view.invoice.notes}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {showForm ? (
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => saveQuoteInvoiceAction(quoteId, { number: form.number, issueDate: form.issueDate, dueDate: form.dueDate || null, notes: form.notes || null }), apply);
          }}
        >
          <TextField
            label="Numero fattura"
            value={form.number}
            required
            maxLength={40}
            placeholder="Es. FT-2026-014"
            disabled={busy}
            onChange={(event) => setForm({ ...form, number: event.target.value })}
          />
          <div className="inv-pair">
            <TextField
              label="Data emissione"
              type="date"
              value={form.issueDate}
              required
              disabled={busy}
              onChange={(event) => {
                const issueDate = event.target.value;
                const suggested = suggestedDueDate(issueDate, view.paymentTerms);
                const autoDue = !form.dueDate || form.dueDate === suggestedDueDate(form.issueDate, view.paymentTerms);
                setForm({ ...form, issueDate, dueDate: autoDue && suggested ? suggested : form.dueDate });
              }}
            />
            <TextField
              label="Data scadenza"
              type="date"
              value={form.dueDate}
              min={form.issueDate || undefined}
              disabled={busy}
              onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
              hint={view.paymentTerms && view.paymentTerms !== "custom" ? "Calcolata dai termini di pagamento, puoi cambiarla." : undefined}
            />
          </div>
          <TextAreaField
            label="Note fatturazione (facoltative)"
            value={form.notes}
            maxLength={500}
            rows={2}
            disabled={busy}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="pay-connect-actions">
            <Button type="submit" loading={pending} disabled={busy}>
              {issued ? "Salva le modifiche" : "Segna la fattura come emessa"}
            </Button>
            {editing ? (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => { setEditing(false); setForm(formFrom(view)); }}>
                Annulla
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <div className="pay-connect-actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setEditing(true)}>
            Modifica i dati della fattura
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => run(() => reopenQuoteInvoiceAction(quoteId), apply)}>
            Riporta in attesa di fattura
          </Button>
        </div>
      )}

      <div className="inv-file">
        {view.pdf ? (
          <>
            <span>
              <strong>{view.pdf.filename}</strong> · {view.pdf.sizeBytes < 1024 * 1024
                ? `${Math.max(1, Math.round(view.pdf.sizeBytes / 1024)).toLocaleString("it-IT")} KB`
                : `${(view.pdf.sizeBytes / (1024 * 1024)).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB`}
            </span>
            <span className="pay-connect-actions">
              <a className="btn btn-secondary" href={`/api/quotes/${encodeURIComponent(quoteId)}/invoice?download=1`}>
                <Download size={15} aria-hidden="true" /> Scarica
              </a>
              <Button type="button" variant="secondary" loading={uploading} disabled={busy} onClick={() => fileRef.current?.click()}>
                <FileUp size={15} aria-hidden="true" /> Sostituisci
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => run(() => removeQuoteInvoicePdfAction(quoteId), (next) => { setView(next); onChanged?.(); })}>
                <Trash2 size={15} aria-hidden="true" /> Rimuovi
              </Button>
            </span>
          </>
        ) : (
          <>
            <span>Upload PDF fattura (facoltativo, max 4 MB). Il cliente lo scarica dal link del preventivo dopo l&apos;emissione.</span>
            <Button type="button" variant="secondary" loading={uploading} disabled={busy} onClick={() => fileRef.current?.click()}>
              <FileUp size={15} aria-hidden="true" /> Carica PDF
            </Button>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
    </section>
  );
}
