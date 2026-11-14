"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronRight, Clock, Copy, Eye, Link2, Lock, Mail, RefreshCw, Send, ShieldCheck, Unlink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonColor, defaultMessage, defaultSubject, EMAIL_LIMITS, emailFooterLines, emailHeading, firstName } from "@/domain/quote-email";
import { copyQuoteLinkAction, getSendContextAction, regenerateQuoteLinkAction, revokeQuoteLinkAction, sendQuoteAction } from "@/server/actions/send";
import type { SendContext, SendResult } from "@/server/quote-send";
import { cn } from "@/lib/cn";

type Mode = "email" | "link";

const shortDate = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome" });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "ctrl-quotes.vercel.app/q/" and a short token: the full link never needs to be read, only copied. */
function linkParts(url: string): { base: string; token: string } {
  const clean = url.replace(/^https?:\/\//, "");
  const at = clean.lastIndexOf("/") + 1;
  const token = clean.slice(at);
  return { base: clean.slice(0, at), token: token.length > 16 ? `${token.slice(0, 10)}…${token.slice(-4)}` : token };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function parseCc(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function SendDialog({
  quoteId,
  open,
  onClose,
  revision,
  unsaved,
}: {
  quoteId: string;
  open: boolean;
  onClose: () => void;
  revision: number;
  /** Autosave still running: sending waits for it, so the version matches what the user sees. */
  unsaved: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [context, setContext] = useState<SendContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [result, setResult] = useState<(SendResult & { mode: Mode; recipientName: string | null }) | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getSendContextAction(quoteId)
      .then((response) => {
        if (cancelled) return;
        if (response.ok) setContext(response.value);
        else setLoadError(response.message);
      })
      .catch(() => !cancelled && setLoadError("Connessione non riuscita. Controlla la rete e riprova."));
    return () => {
      cancelled = true;
    };
  }, [open, quoteId]);

  /** Fresh state at every opening: the context is reloaded, the success screen goes away. */
  function handleClose() {
    setContext(null);
    setLoadError(null);
    setResult(null);
    onClose();
  }

  return (
    <dialog ref={ref} className="send-dialog" aria-labelledby={titleId} closedby="any" onClose={handleClose}>
      <div className="send-panel">
        <header className="send-head">
          <span className="send-badge" aria-hidden="true">
            <Send size={18} />
          </span>
          <div className="send-head-text">
            <h2 id={titleId}>{context?.isUpdate ? "Invia aggiornamento" : "Invia preventivo"}</h2>
            <p>
              {context
                ? [context.quote.number, context.quote.title, context.recipient.clientName ? `per ${context.recipient.clientName}` : null].filter(Boolean).join(" · ")
                : "Preparo l'invio…"}
            </p>
          </div>
          <button type="button" className="send-close" onClick={() => ref.current?.close()} aria-label="Chiudi">
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        {loadError ? (
          <div className="send-state">
            <p className="alert" role="alert">{loadError}</p>
            <div className="send-foot-actions">
              <Button variant="secondary" onClick={() => ref.current?.close()}>Chiudi</Button>
            </div>
          </div>
        ) : !context ? (
          <SendSkeleton />
        ) : result ? (
          <SendSuccess quoteId={quoteId} context={context} result={result} onDone={() => ref.current?.close()} />
        ) : (
          <SendForm
            key={context.quote.id}
            quoteId={quoteId}
            context={context}
            revision={revision}
            unsaved={unsaved}
            onCancel={() => ref.current?.close()}
            onSent={setResult}
            onContextChange={setContext}
          />
        )}
      </div>
    </dialog>
  );
}

function SendSkeleton() {
  return (
    <div className="send-body" aria-busy="true" aria-label="Caricamento">
      <div className="send-col">
        <span className="skeleton" style={{ width: "46%", height: 36 }} />
        <span className="skeleton" style={{ height: 44 }} />
        <span className="skeleton" style={{ height: 44 }} />
        <span className="skeleton" style={{ height: 120 }} />
      </div>
      <div className="send-col send-aside">
        <span className="skeleton" style={{ height: 260 }} />
      </div>
    </div>
  );
}

function SendForm({
  quoteId,
  context,
  revision,
  unsaved,
  onCancel,
  onSent,
  onContextChange,
}: {
  quoteId: string;
  context: SendContext;
  revision: number;
  unsaved: boolean;
  onCancel: () => void;
  onSent: (result: SendResult & { mode: Mode; recipientName: string | null }) => void;
  onContextChange: (context: SendContext) => void;
}) {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<Mode>("email");
  const [to, setTo] = useState(context.recipient.email ?? "");
  const [showCc, setShowCc] = useState(false);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(context.defaults.subject);
  const [message, setMessage] = useState(context.defaults.message);
  const [attachPdf, setAttachPdf] = useState(true);
  const [copyMe, setCopyMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ids = { to: useId(), cc: useId(), subject: useId(), message: useId(), error: useId() };

  const ccList = parseCc(cc);
  const toValid = emailPattern.test(to.trim());
  const ccValid = ccList.every((entry) => emailPattern.test(entry)) && ccList.length <= EMAIL_LIMITS.cc;
  const first = firstName(context.recipient.email && to.trim().toLowerCase() === context.recipient.email.toLowerCase() ? context.recipient.name : null);
  const emailReady = toValid && ccValid && subject.trim().length > 0 && message.trim().length > 0;
  const blocked = context.blockedReason ?? (unsaved ? "Attendi il salvataggio automatico della bozza." : null);
  const canSubmit = !blocked && !pending && (mode === "link" || emailReady);
  const nextVersion = context.nextVersionNo;

  const primaryLabel =
    mode === "email"
      ? `${context.isUpdate ? "Invia aggiornamento" : "Invia"}${first ? ` a ${first}` : ""}`
      : context.link
        ? context.isUpdate
          ? `Pubblica la versione ${nextVersion}`
          : "Segna come inviato"
        : "Crea link e segna come inviato";

  function submit() {
    if (!canSubmit) return;
    setError(null);
    const input =
      mode === "email"
        ? { mode, revision, to: to.trim(), cc: ccList, subject: subject.trim(), message: message.trim(), attachPdf, copyMe }
        : { mode, revision };
    startTransition(async () => {
      try {
        const response = await sendQuoteAction(quoteId, input);
        if (response.ok) onSent({ ...response.value, mode, recipientName: first || null });
        else setError(response.message);
      } catch {
        setError("Connessione non riuscita. Controlla la rete e riprova.");
      }
    });
  }

  function resetDefaults() {
    setSubject(defaultSubject(context.quote.title, context.isUpdate));
    setMessage(defaultMessage({ recipientName: context.recipient.name, title: context.quote.title, senderName: context.sender.name, isUpdate: context.isUpdate }));
  }

  const fade = reduce ? {} : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const } };

  return (
    <form
      className="send-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      noValidate
    >
      <div className="send-body">
        <div className="send-col">
          <div className="send-seg" role="radiogroup" aria-label="Modalità di invio">
            {(
              [
                { value: "email", label: "Email con link", icon: Mail },
                { value: "link", label: "Solo link", icon: Link2 },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={mode === option.value}
                className={cn("send-seg-item", mode === option.value && "is-on")}
                onClick={() => setMode(option.value)}
              >
                {mode === option.value ? (
                  <motion.span layoutId="send-seg-pill" className="send-seg-pill" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }} />
                ) : null}
                <option.icon size={15} aria-hidden="true" />
                <span>{option.label}</span>
              </button>
            ))}
          </div>

          <LinkBox quoteId={quoteId} context={context} onContextChange={onContextChange} />

          <AnimatePresence mode="wait" initial={false}>
            {mode === "email" ? (
              <motion.div key="email" className="send-fields" {...fade}>
                <hr className="send-sep" />
                <div className="send-field">
                  <label htmlFor={ids.to}>A</label>
                  <div className={cn("send-input send-to", to && !toValid && "is-invalid")}>
                    {context.recipient.name && context.recipient.email && to.trim().toLowerCase() === context.recipient.email.toLowerCase() ? (
                      <span className="send-chip-av" aria-hidden="true">{initials(context.recipient.name)}</span>
                    ) : (
                      <Mail size={15} aria-hidden="true" className="send-input-ic" />
                    )}
                    {context.recipient.name && context.recipient.email && to.trim().toLowerCase() === context.recipient.email.toLowerCase() ? (
                      <span className="send-chip-name">{context.recipient.name}</span>
                    ) : null}
                    <input
                      id={ids.to}
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                      spellCheck={false}
                      value={to}
                      onChange={(event) => setTo(event.target.value)}
                      placeholder="email del cliente"
                      aria-invalid={Boolean(to) && !toValid}
                      required
                    />
                    {showCc ? null : (
                      <button type="button" className="send-link-btn" onClick={() => setShowCc(true)}>
                        + Cc
                      </button>
                    )}
                  </div>
                  {!context.recipient.email ? <small className="send-hint">Il cliente non ha un&apos;email in anagrafica: scrivila qui.</small> : null}
                </div>
                <AnimatePresence initial={false}>
                  {showCc ? (
                    <motion.div key="cc" className="send-field" {...fade}>
                      <label htmlFor={ids.cc}>Cc</label>
                      <div className={cn("send-input", cc && !ccValid && "is-invalid")}>
                        <input
                          id={ids.cc}
                          type="text"
                          inputMode="email"
                          autoComplete="off"
                          spellCheck={false}
                          value={cc}
                          onChange={(event) => setCc(event.target.value)}
                          placeholder="altri indirizzi, separati da virgola"
                          aria-invalid={Boolean(cc) && !ccValid}
                          autoFocus
                        />
                      </div>
                      {cc && !ccValid ? <small className="send-hint is-error">Controlla gli indirizzi (al massimo {EMAIL_LIMITS.cc}).</small> : null}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                <div className="send-field">
                  <label htmlFor={ids.subject}>Oggetto</label>
                  <div className="send-input">
                    <input id={ids.subject} value={subject} maxLength={EMAIL_LIMITS.subject} onChange={(event) => setSubject(event.target.value)} />
                  </div>
                </div>
                <div className="send-field">
                  <div className="send-label-row">
                    <label htmlFor={ids.message}>Messaggio</label>
                    {subject !== context.defaults.subject || message !== context.defaults.message ? (
                      <button type="button" className="send-link-btn" onClick={resetDefaults}>
                        Ripristina testo
                      </button>
                    ) : null}
                  </div>
                  <textarea id={ids.message} className="send-input send-area" value={message} maxLength={EMAIL_LIMITS.message} rows={6} onChange={(event) => setMessage(event.target.value)} />
                </div>
                <label className="send-attach">
                  <span className="send-pdf" aria-hidden="true">PDF</span>
                  <span className="send-attach-text">
                    <strong>{context.pdfFilename}</strong>
                    <small>{attachPdf ? "Allegato all'email" : "Non allegato: il cliente lo scarica dal link"}</small>
                  </span>
                  <input type="checkbox" role="switch" className="send-switch" checked={attachPdf} onChange={(event) => setAttachPdf(event.target.checked)} aria-label="Allega il PDF" />
                </label>
                {context.sender.email ? (
                  <label className="send-check">
                    <input type="checkbox" checked={copyMe} onChange={(event) => setCopyMe(event.target.checked)} />
                    <span>Mandami una copia ({context.sender.email})</span>
                  </label>
                ) : null}
              </motion.div>
            ) : (
              <motion.div key="link" className="send-fields" {...fade}>
                <hr className="send-sep" />
                <div className="send-note">
                  <Link2 size={15} aria-hidden="true" />
                  <span>
                    Copia il link e mandalo come preferisci: WhatsApp, la tua email, un messaggio. Il preventivo passa a <b>Inviato</b> e il cliente vede la versione {nextVersion}.
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <aside className="send-col send-aside" aria-label={mode === "email" ? "Anteprima email" : "Cosa vede il cliente"}>
          {mode === "email" ? (
            <>
              <div className="send-aside-title">
                <Eye size={14} aria-hidden="true" /> Anteprima email
              </div>
              <EmailPreview context={context} message={message} />
            </>
          ) : null}
          <div className="send-note">
            <Lock size={15} aria-hidden="true" />
            <span>
              {context.isUpdate && context.sentVersionNo !== null && context.sentVersionNo !== nextVersion ? (
                <>
                  Ora il cliente vede la versione {context.sentVersionNo}. Con l&apos;invio passa alla <b>versione {nextVersion}</b>, allo stesso link.
                </>
              ) : (
                <>
                  Il cliente vede la <b>versione {nextVersion}</b>, bloccata. Se poi modifichi la bozza, lui continua a vedere questa finché non invii la nuova.
                </>
              )}
              {context.needsNewVersion ? " La versione si crea in automatico all'invio." : null}
            </span>
          </div>
          {!context.emailLive && mode === "email" ? (
            <div className="send-note is-warn">
              <AlertTriangle size={15} aria-hidden="true" />
              <span>Modalità prova: le email non partono davvero, restano nel registro del server. Il link funziona comunque.</span>
            </div>
          ) : null}
        </aside>
      </div>

      <footer className="send-foot">
        <div className="send-foot-msg" aria-live="polite">
          {error ? (
            <span id={ids.error} className="send-error" role="alert">{error}</span>
          ) : blocked ? (
            <span className="send-error">{blocked}</span>
          ) : mode === "email" ? (
            <span>Le risposte all&apos;email arrivano a te, non a CTRL Quotes.</span>
          ) : (
            <span>Nessuna email parte: il link lo condividi tu.</span>
          )}
        </div>
        <div className="send-foot-actions">
          <Button variant="secondary" onClick={onCancel}>Annulla</Button>
          <Button type="submit" loading={pending} disabled={!canSubmit} aria-describedby={error ? ids.error : undefined}>
            {mode === "email" ? <Send size={15} aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />} {primaryLabel}
          </Button>
        </div>
      </footer>
    </form>
  );
}

function LinkBox({ quoteId, context, onContextChange }: { quoteId: string; context: SendContext; onContextChange: (context: SendContext) => void }) {
  const [busy, startTransition] = useTransition();
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const link = context.link;
  const parts = link?.url ? linkParts(link.url) : null;
  const expires = link?.expiresAt ?? null;

  function copy() {
    startTransition(async () => {
      const response = await copyQuoteLinkAction(quoteId);
      if (!response.ok) return void toast.error(response.message);
      if (response.value.regenerated) onContextChange({ ...context, link: link ? { ...link, url: response.value.url } : null });
      if (await copyText(response.value.url)) toast.success("Link copiato.");
      else toast.error("Copia non riuscita: seleziona il link a mano.");
    });
  }

  function regenerate() {
    startTransition(async () => {
      const response = await regenerateQuoteLinkAction(quoteId);
      if (!response.ok) return void toast.error(response.message);
      toast.success(response.message ?? "Nuovo link creato.");
      const refreshed = await getSendContextAction(quoteId);
      if (refreshed.ok) onContextChange(refreshed.value);
    });
  }

  function revoke() {
    startTransition(async () => {
      const response = await revokeQuoteLinkAction(quoteId);
      setConfirmRevoke(false);
      if (!response.ok) return void toast.error(response.message);
      toast.success(response.message ?? "Link revocato.");
      const refreshed = await getSendContextAction(quoteId);
      if (refreshed.ok) onContextChange(refreshed.value);
    });
  }

  return (
    <div className="send-field">
      <span className="send-label">Link privato del cliente</span>
      <div className={cn("send-linkbox", !parts && "is-empty")}>
        <Lock size={15} aria-hidden="true" />
        {parts ? (
          <code title="Link personale del cliente">
            {parts.base}
            <b>{parts.token}</b>
          </code>
        ) : (
          <span className="send-linkbox-empty">{link ? "Link da rigenerare" : "Il link viene creato all'invio"}</span>
        )}
        <Button variant="secondary" className="send-btn-sm" onClick={copy} disabled={!link || busy}>
          <Copy size={14} aria-hidden="true" /> Copia
        </Button>
      </div>
      <div className="send-meta">
        <span>
          <Clock size={13} aria-hidden="true" />
          {expires ? `Scade il ${shortDate.format(new Date(new Date(expires).getTime() - 1))}, con la validità` : context.validUntilLabel ? `Scade il ${context.validUntilLabel}, con la validità` : "Senza scadenza"}
        </span>
        <span>
          <ShieldCheck size={13} aria-hidden="true" /> Non indicizzato, si apre senza account
        </span>
      </div>
      {link ? (
        confirmRevoke ? (
          <div className="send-confirm" role="group" aria-label="Conferma revoca">
            <span>Revocare il link? Il cliente non potrà più aprire il preventivo.</span>
            <Button variant="secondary" className="send-btn-sm" onClick={() => setConfirmRevoke(false)} disabled={busy}>No</Button>
            <Button className="send-btn-sm send-danger" onClick={revoke} loading={busy}>Revoca</Button>
          </div>
        ) : (
          <div className="send-link-actions">
            <button type="button" className="send-link-btn" onClick={regenerate} disabled={busy}>
              <RefreshCw size={13} aria-hidden="true" /> Rigenera link
            </button>
            <button type="button" className="send-link-btn is-danger" onClick={() => setConfirmRevoke(true)} disabled={busy}>
              <Unlink size={13} aria-hidden="true" /> Revoca
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}

function EmailPreview({ context, message }: { context: SendContext; message: string }) {
  const lines = emailFooterLines({ quoteNumber: context.quote.number, totalLabel: context.totalLabel, validUntilLabel: context.validUntilLabel });
  const from = [context.sender.name, context.studioName].filter(Boolean).join(" · ");
  return (
    <div className="send-mail" aria-hidden="true">
      <div className="send-mail-bar">
        <b>{from}</b>
        <span>ora</span>
      </div>
      <div className="send-mail-in">
        <span className="send-mail-logo">
          <i>{(context.studioName.trim()[0] ?? "S").toUpperCase()}</i>
          {context.studioName}
        </span>
        <h4>{emailHeading(context.isUpdate)}</h4>
        <p>{message.trim() || "Scrivi un messaggio per il cliente."}</p>
        <span className="send-mail-cta" style={{ background: buttonColor(context.brandColor) }}>
          Apri il preventivo <ChevronRight size={14} />
        </span>
        <div className="send-mail-foot">
          {lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SendSuccess({
  quoteId,
  context,
  result,
  onDone,
}: {
  quoteId: string;
  context: SendContext;
  result: SendResult & { mode: Mode; recipientName: string | null };
  onDone: () => void;
}) {
  const reduce = useReducedMotion();
  const [busy, startTransition] = useTransition();
  const parts = result.link.url ? linkParts(result.link.url) : null;
  const title =
    result.mode === "email" ? (result.isUpdate ? "Aggiornamento inviato" : "Preventivo inviato") : result.isUpdate ? `Versione ${result.versionNo} pubblicata` : "Link pronto";
  const body =
    result.mode === "email"
      ? `${result.recipientName ? `L'email a ${result.recipientName}` : "L'email"} è in coda e parte tra pochi secondi.${context.emailLive ? "" : " In modalità prova resta nel registro del server."}`
      : "Copia il link e condividilo come preferisci. Il preventivo ora è segnato come Inviato.";

  function copy() {
    startTransition(async () => {
      const url = result.link.url ?? (await copyQuoteLinkAction(quoteId).then((response) => (response.ok ? response.value.url : null)));
      if (url && (await copyText(url))) toast.success("Link copiato.");
      else toast.error("Copia non riuscita: seleziona il link a mano.");
    });
  }

  return (
    <motion.div
      className="send-success"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      role="status"
    >
      <motion.span
        className="send-success-mark"
        initial={reduce ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.05 }}
        aria-hidden="true"
      >
        <Check size={26} strokeWidth={2.6} />
      </motion.span>
      <h3>{title}</h3>
      <p>{body}</p>
      <div className="send-linkbox">
        <Lock size={15} aria-hidden="true" />
        <code>
          {parts?.base}
          <b>{parts?.token}</b>
        </code>
        <Button variant="secondary" className="send-btn-sm" onClick={copy} disabled={busy}>
          <Copy size={14} aria-hidden="true" /> Copia
        </Button>
      </div>
      <p className="send-hint">Versione {result.versionNo} · stato Inviato. Puoi continuare a modificare la bozza: il cliente la vede solo quando invii l&apos;aggiornamento.</p>
      <Button onClick={onDone} autoFocus>
        Fatto
      </Button>
    </motion.div>
  );
}
