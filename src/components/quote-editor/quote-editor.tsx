"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Download,
  Eye,
  History,
  LoaderCircle,
  Lock,
  Monitor,
  Redo2,
  RotateCcw,
  Send,
  Settings2,
  Smartphone,
  SquarePen,
  Stamp,
  Undo2,
} from "lucide-react";
import { useAction } from "@/components/data/use-action";
import { QuoteDocumentView } from "@/components/quote-render/quote-document";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlays";
import { StatusBadge } from "@/components/ui/status";
import { formatEuro } from "@/domain/money";
import type { PriceMode } from "@/domain/pricing";
import { insertionIndex } from "@/domain/document-ops";
import { blockLabel, starterBlock, type BlockType, type QuoteBlock } from "@/domain/quote-document";
import { asTemplateKey, headlineTotal, type QuoteSnapshot } from "@/domain/quote-snapshot";
import { templateIdFor } from "@/domain/templates";
import { quoteStatusLabel, quoteStatusTone } from "@/domain/quote-status";
import { createVersionAction, restoreVersionAction } from "@/server/actions/quotes";
import type { ClientOption, QuotableItem, QuoteEditorData } from "@/server/quotes";
import type { TemplateRow } from "@/server/templates";
import { cn } from "@/lib/cn";
import { BlockForm } from "./block-form";
import { BlockList, blockIcon, blockTitle } from "./block-list";
import { StylePanel } from "./style-panel";
import { PercentInput } from "./inputs";
import { useQuoteDraft, useUndoShortcuts, type SaveState } from "./state/use-quote-draft";
import { useEditorMode } from "./mode";
import { ModeToggle } from "./mode-toggle";
import { VisualeView } from "./visuale/visuale-view";
import { imagePlaceholder } from "./image-placeholder";

type Tab = "editor" | "details" | "versions";
type Pane = "structure" | "content" | "preview";


const timeFormat = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
const dateTimeFormat = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome" });

export function QuoteEditor({
  data,
  clients,
  items,
  templates,
  defaults,
  logoUrl,
  visuale: visualeEnabled = false,
}: {
  data: QuoteEditorData;
  clients: ClientOption[];
  items: QuotableItem[];
  templates: TemplateRow[];
  defaults: { taxRateBp: number; priceMode: PriceMode };
  logoUrl: string | null;
  /** The editor visuale flag, read on the server. */
  visuale?: boolean;
}) {
  const router = useRouter();
  const readOnly = !data.canEdit;
  const templateIdOf = (key: string) => templates.find((template) => template.key === key)?.id ?? templateIdFor(asTemplateKey(key));
  const draft = useQuoteDraft({
    data,
    readOnly,
    initialMeta: {
      title: data.quote.title,
      clientId: data.quote.clientId,
      templateId: templateIdOf(data.quote.templateKey),
      validUntil: data.quote.validUntil,
    },
  });
  const { document, meta, changeMeta, run, selectedId, setSelectedId, totals, save, saveState, saveError, savedAt, revision, unsaved } = draft;
  useUndoShortcuts(draft, !readOnly);
  const editorMode = useEditorMode(visualeEnabled);
  const visuale = editorMode.mode === "visuale";
  const [tab, setTab] = useState<Tab>("editor");
  const [pane, setPane] = useState<Pane>("content");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [restoreTarget, setRestoreTarget] = useState<number | null>(null);
  const versionAction = useAction();
  const restoreAction = useAction();

  const fiscal = data.snapshot.fiscal;
  const changeBlock = (block: QuoteBlock) => run({ kind: "replaceBlock", block }, { group: `block:${block.id}` });

  const selected = draft.selected;
  const client = clients.find((entry) => entry.id === meta.clientId);
  const templateKey = asTemplateKey(templates.find((template) => template.id === meta.templateId)?.key);

  const snapshot: QuoteSnapshot = useMemo(
    () => ({
      ...data.snapshot,
      quote: {
        ...data.snapshot.quote,
        title: meta.title,
        validUntil: meta.validUntil ? `${meta.validUntil}T12:00:00.000Z` : null,
      },
      client:
        meta.clientId === data.quote.clientId
          ? data.snapshot.client
          : client
            ? { name: client.name, kind: client.kind, vatNumber: null, taxCode: null, address: null, email: client.email, contactName: null }
            : null,
      template: templateKey,
      document,
      totals,
    }),
    [data.snapshot, data.quote.clientId, meta, client, templateKey, document, totals],
  );

  const previewRef = useRef<HTMLDivElement>(null);

  const addBlock = (type: BlockType) => {
    // Starter content, so the new block shows in the preview at once.
    const block = starterBlock(type, defaults);
    const result = run({ kind: "insertBlock", block, index: insertionIndex(document, selected?.id ?? null) });
    if (!result.ok) return;
    setSelectedId(block.id);
    setPane("content");
    // The preview scrolls to the new block once it has rendered.
    window.setTimeout(() => {
      const target = previewRef.current?.querySelector(`[data-block-id="${CSS.escape(block.id)}"]`);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    }, 120);
  };

  const duplicateBlock = (id: string) => {
    const at = document.blocks.findIndex((block) => block.id === id);
    const result = run({ kind: "duplicateBlock", blockId: id });
    const copy = result.ok ? result.value.blocks[at + 1] : undefined;
    if (copy) setSelectedId(copy.id);
  };

  const removeBlock = (id: string) => {
    const at = document.blocks.findIndex((entry) => entry.id === id);
    const block = document.blocks[at];
    if (!block) return;
    const result = run({ kind: "removeBlock", blockId: id });
    if (!result.ok) return;
    if (selectedId === id) setSelectedId(result.value.blocks[0]?.id ?? null);
    // "Annulla" puts this very block back where it was, even after other edits; one toast at a time.
    const restore = () => {
      if (run({ kind: "insertBlock", block, index: at }, { quiet: true }).ok) setSelectedId(block.id);
    };
    toast(`Blocco eliminato: ${blockTitle(block)}`, { id: "block-removed", action: { label: "Annulla", onClick: restore }, duration: 6000 });
  };

  const lockBlock = (id: string, locked: boolean) => run({ kind: "lockBlock", blockId: id, locked });

  return (
    <div className="editor">
      <header className="editor-head">
        <div className="editor-title">
          <Link href="/app/quotes" className="icon-btn" aria-label="Torna ai preventivi">
            <ArrowLeft size={16} aria-hidden="true" />
          </Link>
          <div>
            <p className="editor-crumbs muted small">
              <Link href="/app/quotes">Preventivi</Link> / <span>{data.quote.number ?? "Senza numero"}</span>
            </p>
            <h1 className="clamp-1">
              {data.quote.number ? `${data.quote.number} · ` : ""}
              {meta.title || "Senza titolo"}
            </h1>
            <p className="editor-sub muted small">
              {client?.name ?? data.snapshot.client?.name ?? "Nessun cliente"}
              <StatusBadge tone={quoteStatusTone[data.quote.status]}>{quoteStatusLabel[data.quote.status]}</StatusBadge>
            </p>
          </div>
        </div>
        <div className="editor-actions">
          {readOnly ? null : (
            <div className="history-actions" role="group" aria-label="Cronologia delle modifiche">
              <button type="button" className="icon-btn" onClick={draft.undo} disabled={!draft.canUndo} aria-label="Annulla" title="Annulla (Ctrl+Z)">
                <Undo2 size={16} aria-hidden="true" />
              </button>
              <button type="button" className="icon-btn" onClick={draft.redo} disabled={!draft.canRedo} aria-label="Ripeti" title="Ripeti (Ctrl+Maiusc+Z)">
                <Redo2 size={16} aria-hidden="true" />
              </button>
            </div>
          )}
          <SaveIndicator state={saveState} savedAt={savedAt} error={saveError} onRetry={() => void save()} readOnly={readOnly} />
          <Link className="btn btn-secondary" href={`/app/quotes/${data.quote.id}/preview`} aria-disabled={unsaved || undefined} onClick={(event) => unsaved && event.preventDefault()}>
            <Eye size={16} aria-hidden="true" /> Anteprima
          </Link>
          <a className="btn btn-secondary" href={`/api/quotes/${data.quote.id}/pdf`} target="_blank" rel="noopener" aria-disabled={unsaved || undefined} onClick={(event) => unsaved && event.preventDefault()}>
            <Download size={16} aria-hidden="true" /> PDF bozza
          </a>
          <Button
            onClick={() => versionAction.run(() => createVersionAction(data.quote.id, revision), () => setTab("versions"))}
            loading={versionAction.pending}
            disabled={readOnly || unsaved || saveState === "conflict" || !meta.clientId}
            title={!meta.clientId ? "Scegli un cliente nei dettagli." : unsaved ? "Attendi il salvataggio automatico." : undefined}
          >
            <Stamp size={16} aria-hidden="true" /> Salva versione
          </Button>
          <span className="future-wrap" title="L'invio al cliente arriva con la pubblicazione, nella prossima fase.">
            <button type="button" className="btn btn-primary" disabled aria-describedby="send-hint">
              <Send size={16} aria-hidden="true" /> Invia
            </button>
            <span id="send-hint" className="visually-hidden">
              L&apos;invio al cliente arriva con la pubblicazione, nella prossima fase.
            </span>
          </span>
        </div>
      </header>

      {data.documentRecovered ? (
        <p className="alert" role="status">
          La bozza salvata non era leggibile ed è stata ricostruita con la struttura di base. Controlla i contenuti prima di salvare una versione.
        </p>
      ) : null}
      {readOnly ? (
        <p className="readonly-note">
          {data.quote.status === "draft" ? "Il tuo ruolo permette solo la consultazione." : "Questo preventivo non è più una bozza: i contenuti sono in sola lettura."}
        </p>
      ) : null}

      <div className="editor-tabbar">
        <div className="tabs editor-tabs" role="tablist" aria-label="Sezioni dell'editor">
          {(
            [
              ["editor", "Editor", SquarePen],
              ["details", "Dettagli", Settings2],
              ["versions", `Versioni${data.versions.length ? ` (${data.versions.length})` : ""}`, History],
            ] as const
          ).map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} id={`editor-tab-${id}`} aria-controls={`editor-panel-${id}`} onClick={() => setTab(id)}>
              <Icon size={15} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        {editorMode.enabled ? (
          <ModeToggle
            mode={editorMode.mode}
            capable={editorMode.capable}
            onMode={(mode) => {
              if (unsaved) void save();
              editorMode.choose(mode);
              setTab("editor");
            }}
          />
        ) : null}
      </div>

      {tab === "editor" && visuale ? (
        <div role="tabpanel" id="editor-panel-editor" aria-labelledby="editor-tab-editor">
          <VisualeView draft={draft} snapshot={snapshot} logoUrl={logoUrl} readOnly={readOnly} quoteId={data.quote.id} items={items} defaults={defaults} />
        </div>
      ) : null}

      {tab === "editor" && !visuale ? (
        <div role="tabpanel" id="editor-panel-editor" aria-labelledby="editor-tab-editor">
          <div className="segmented editor-panes" role="group" aria-label="Pannello">
            {(
              [
                ["structure", "Struttura"],
                ["content", "Contenuto"],
                ["preview", "Anteprima"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={pane === id} onClick={() => setPane(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className={cn("editor-grid", `show-${pane}`)}>
            <BlockList
              blocks={document.blocks}
              selectedId={selectedId}
              readOnly={readOnly}
              onSelect={(id) => {
                setSelectedId(id);
                setPane("content");
              }}
              onReorder={(blocks) => run({ kind: "reorderBlocks", ids: blocks.map((block) => block.id) })}
              onToggle={(id) => run({ kind: "toggleBlock", blockId: id })}
              onDuplicate={duplicateBlock}
              onRemove={removeBlock}
              onLock={lockBlock}
              onAdd={addBlock}
            />
            <div className="editor-col">
              <section className="card editor-panel content-panel" aria-labelledby="content-title">
                {selected ? (
                  <>
                    <div className="panel-head">
                      <h2 id="content-title">
                        {(() => {
                          const Icon = blockIcon[selected.type];
                          return <Icon size={16} aria-hidden="true" />;
                        })()}
                        {blockLabel[selected.type]}
                      </h2>
                      {!selected.visible ? <StatusBadge tone="draft">Nascosto</StatusBadge> : null}
                    </div>
                    {selected.locked ? (
                      <div className="lock-note" role="note">
                        <Lock size={14} aria-hidden="true" />
                        <span>Contenuto bloccato: non si modifica finché non lo sblocchi. Il PDF non cambia.</span>
                        {readOnly ? null : (
                          <Button variant="secondary" className="btn-sm" onClick={() => lockBlock(selected.id, false)}>
                            Sblocca
                          </Button>
                        )}
                      </div>
                    ) : null}
                    <BlockForm
                      key={selected.id}
                      block={selected}
                      onChange={changeBlock}
                      ctx={{ quoteId: data.quote.id, items, defaults, taxProfile: fiscal.taxProfile, totals, readOnly: readOnly || Boolean(selected.locked) }}
                    />
                  </>
                ) : (
                  <p className="muted">Seleziona un blocco nella struttura.</p>
                )}
              </section>
              <StylePanel
                templates={templates}
                templateId={meta.templateId}
                templateKey={templateKey}
                document={document}
                brandName={data.snapshot.issuer.displayName}
                brandAccent={data.snapshot.brand.colorSecondary}
                logoUrl={logoUrl}
                readOnly={readOnly}
                onTemplate={(templateId) => changeMeta({ templateId })}
                onStyle={(style) => run({ kind: "setStyle", style }, { group: "style" })}
              />
            </div>
            <section className="card editor-panel preview-panel" aria-label="Anteprima live">
              <div className="panel-head">
                <div className="segmented" role="group" aria-label="Dispositivo">
                  <button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")} aria-label="Anteprima desktop">
                    <Monitor size={15} aria-hidden="true" />
                  </button>
                  <button type="button" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")} aria-label="Anteprima mobile">
                    <Smartphone size={15} aria-hidden="true" />
                  </button>
                </div>
                <span className="preview-total">
                  <span className="muted small">Totale</span> <strong>{headlineTotal(totals)}</strong>
                </span>
              </div>
              <div ref={previewRef} className={cn("preview-scroll", device === "mobile" && "is-mobile")} tabIndex={0} role="region" aria-label="Documento in anteprima">
                <QuoteDocumentView snapshot={snapshot} logoSrc={logoUrl} watermark="Bozza" activeBlockId={selectedId} layout={device === "mobile" ? "flow" : "sheet"} imagePlaceholder={imagePlaceholder} />
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {tab === "details" ? (
        <section role="tabpanel" id="editor-panel-details" aria-labelledby="editor-tab-details" className="card details-panel">
          <fieldset disabled={readOnly} className="details-grid">
            <legend className="visually-hidden">Dettagli del preventivo</legend>
            <TextField label="Titolo" value={meta.title} maxLength={140} onChange={(event) => changeMeta({ title: event.target.value })} error={meta.title.trim().length < 2 ? "Il titolo deve avere almeno 2 caratteri." : undefined} />
            <SelectField
              label="Cliente"
              value={meta.clientId ?? ""}
              options={[
                ...(meta.clientId && !client && data.snapshot.client ? [{ value: meta.clientId, label: `${data.snapshot.client.name} (archiviato)` }] : []),
                ...clients.map((entry) => ({ value: entry.id, label: entry.name })),
              ]}
              onChange={(event) => changeMeta({ clientId: event.target.value || null })}
            />
            <div className="field">
              <label htmlFor="valid-until">Valido fino al</label>
              <input id="valid-until" type="date" value={meta.validUntil ?? ""} onChange={(event) => changeMeta({ validUntil: event.target.value || null })} />
              <span className="field-hint">Dopo questa data il preventivo non sarà più accettabile, quando arriverà la pubblicazione.</span>
            </div>
            <SelectField label="Template" value={meta.templateId} options={templates.map((template) => ({ value: template.id, label: template.name }))} onChange={(event) => changeMeta({ templateId: event.target.value })} />
            {fiscal.taxProfile === "ordinario" ? (
              <PercentInput
                label="Ritenuta d'acconto (informativa)"
                bp={document.withholdingBp}
                max={5000}
                onBp={(bp) => run({ kind: "setWithholding", bp }, { group: "withholding" })}
              />
            ) : null}
          </fieldset>
          <dl className="facts">
            <div>
              <dt>Numero</dt>
              <dd>{data.quote.number ?? "Non assegnato"}</dd>
            </div>
            <div>
              <dt>Creato</dt>
              <dd>{dateTimeFormat.format(data.quote.createdAt)}</dd>
            </div>
            <div>
              <dt>Regime fiscale</dt>
              <dd>{fiscal.taxProfile === "ordinario" ? "Ordinario" : fiscal.taxProfile === "forfettario" ? "Forfettario" : "Estero"}</dd>
            </div>
            <div>
              <dt>Totale una tantum</dt>
              <dd>{formatEuro(totals.main.oneTime.totalCents)}</dd>
            </div>
          </dl>
          <p className="muted small">
            Il numero viene assegnato alla creazione secondo la <Link href="/app/settings/numbering">numerazione del workspace</Link> e non viene mai riutilizzato.
          </p>
        </section>
      ) : null}

      {tab === "versions" ? (
        <section role="tabpanel" id="editor-panel-versions" aria-labelledby="editor-tab-versions" className="card versions-panel">
          <div className="panel-head">
            <div>
              <h2>Versioni</h2>
              <p className="muted small">
                Una versione congela contenuti, Brand Kit, template e totali con un&apos;impronta SHA-256. Non cambia più, anche se modifichi la bozza o il Brand Kit.
              </p>
            </div>
            <Button
              onClick={() => versionAction.run(() => createVersionAction(data.quote.id, revision))}
              loading={versionAction.pending}
              disabled={readOnly || unsaved || saveState === "conflict" || !meta.clientId}
            >
              <Stamp size={16} aria-hidden="true" /> Salva versione
            </Button>
          </div>
          {versionAction.error ? (
            <p className="field-error" role="alert">
              {versionAction.error}
            </p>
          ) : null}
          {data.versions.length === 0 ? (
            <p className="muted">Ancora nessuna versione. Salvane una quando la bozza è pronta da rivedere o da inviare.</p>
          ) : (
            <ol className="version-list">
              {data.versions.map((version) => (
                <li key={version.id} className="version-row">
                  <span className="version-no">v{version.versionNo}</span>
                  <span className="version-meta">
                    <strong>{dateTimeFormat.format(version.createdAt)}</strong>
                    <span className="muted small">
                      {version.authorName ?? "Utente rimosso"} · impronta <code>{version.sha256.slice(0, 12)}</code>
                    </span>
                  </span>
                  <span className="version-total">{formatEuro(version.totalCents)}</span>
                  <span className="version-actions">
                    <Link className="btn btn-ghost btn-sm" href={`/app/quotes/${data.quote.id}/preview?v=${version.versionNo}`}>
                      <Eye size={14} aria-hidden="true" /> Apri
                    </Link>
                    <a className="btn btn-ghost btn-sm" href={`/api/quotes/${data.quote.id}/pdf?v=${version.versionNo}`} target="_blank" rel="noopener">
                      <Download size={14} aria-hidden="true" /> PDF
                    </a>
                    {readOnly ? null : (
                      <Button variant="ghost" className="btn-sm" onClick={() => setRestoreTarget(version.versionNo)} disabled={unsaved}>
                        <RotateCcw size={14} aria-hidden="true" /> Ripristina
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      <Dialog open={restoreTarget !== null} title={`Ripristinare la versione ${restoreTarget ?? ""}?`} onClose={() => setRestoreTarget(null)}>
        <p>I contenuti della bozza attuale vengono sostituiti da quelli della versione. Le versioni salvate restano tutte invariate.</p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setRestoreTarget(null)} autoFocus>
            Annulla
          </Button>
          <Button
            loading={restoreAction.pending}
            onClick={() => {
              const target = restoreTarget;
              if (target === null) return;
              restoreAction.run(
                () => restoreVersionAction(data.quote.id, target, revision),
                () => {
                  setRestoreTarget(null);
                  router.refresh();
                },
              );
            }}
          >
            Ripristina
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function SaveIndicator({ state, savedAt, error, onRetry, readOnly }: { state: SaveState; savedAt: Date; error: string | null; onRetry: () => void; readOnly: boolean }) {
  if (readOnly) return null;
  if (state === "saving" || state === "dirty") {
    return (
      <span className="save-indicator" role="status">
        <LoaderCircle size={15} aria-hidden="true" className="spin" /> {state === "saving" ? "Salvataggio in corso" : "Modifiche in attesa"}
      </span>
    );
  }
  if (state === "error" || state === "conflict") {
    return (
      <span className="save-indicator is-error" role="alert">
        <CircleAlert size={15} aria-hidden="true" /> {error ?? "Salvataggio non riuscito."}
        {state === "error" ? (
          <button type="button" className="link-btn" onClick={onRetry}>
            Riprova
          </button>
        ) : (
          <button type="button" className="link-btn" onClick={() => window.location.reload()}>
            Ricarica
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="save-indicator is-ok" role="status">
      <CheckCircle2 size={15} aria-hidden="true" /> Salvato alle {timeFormat.format(savedAt)}
    </span>
  );
}
