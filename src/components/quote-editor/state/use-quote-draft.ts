"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { applyCommand, type CommandOptions, type DocumentCommand, type OpResult } from "@/domain/document-ops";
import { computeTotals, type QuoteDocument, type QuoteTotals } from "@/domain/quote-document";
import { saveDraftAction } from "@/server/actions/quotes";
import type { QuoteEditorData } from "@/server/quotes";
import { createHistory, record, redo as redoStep, undo as undoStep, type History } from "./history";

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";
export type Meta = { title: string; clientId: string | null; templateId: string; validUntil: string | null };
export type Draft = { document: QuoteDocument; meta: Meta };

export const AUTOSAVE_MS = 900;

/**
 * The one state of the quote editor, shared by every editing mode: document, meta, selection,
 * undo and redo, autosave with optimistic revisions, and the totals the server sends back.
 */
export function useQuoteDraft({ data, initialMeta, readOnly, order = "free" }: { data: QuoteEditorData; initialMeta: Meta; readOnly: boolean; order?: CommandOptions["order"] }) {
  const [history, setHistory] = useState<History<Draft>>(() => createHistory({ document: data.document, meta: initialMeta }));
  const { document, meta } = history.present;
  const [selectedId, setSelectedId] = useState<string | null>(data.document.blocks[0]?.id ?? null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date>(data.draftUpdatedAt);
  const [revision, setRevision] = useState(data.revision);
  /** Totals computed by the server for the draft it stored, with the document they belong to. */
  const [server, setServer] = useState<{ document: QuoteDocument; totals: QuoteTotals }>({ document: data.document, totals: data.totals });

  const revisionRef = useRef(data.revision);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const latest = useRef(history.present);
  useEffect(() => {
    latest.current = history.present;
  }, [history.present]);

  const save = useCallback(async () => {
    if (readOnly) return;
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    inFlight.current = true;
    setSaveState("saving");
    const { meta: currentMeta, document: currentDocument } = latest.current;
    try {
      const result = await saveDraftAction(data.quote.id, {
        revision: revisionRef.current,
        title: currentMeta.title,
        clientId: currentMeta.clientId,
        templateId: currentMeta.templateId,
        validUntil: currentMeta.validUntil,
        document: currentDocument,
      });
      if (result.ok) {
        revisionRef.current = result.value.revision;
        setRevision(result.value.revision);
        setSavedAt(new Date(result.value.savedAt));
        setServer({ document: currentDocument, totals: result.value.totals });
        setSaveError(null);
        setSaveState(queued.current ? "dirty" : "saved");
      } else {
        setSaveError(result.message);
        setSaveState(result.message.includes("Ricarica") ? "conflict" : "error");
        queued.current = false;
      }
    } catch {
      setSaveError("Connessione non riuscita. Le modifiche restano qui: riprovo al prossimo cambiamento.");
      setSaveState("error");
    } finally {
      inFlight.current = false;
      if (queued.current) {
        queued.current = false;
        void save();
      }
    }
  }, [data.quote.id, readOnly]);

  useEffect(() => {
    if (saveState !== "dirty") return;
    const timer = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [saveState, history.present, save]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (saveState === "dirty" || saveState === "saving" || saveState === "error") event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  const touch = useCallback(() => {
    if (readOnly) return;
    setSaveState((state) => (state === "conflict" ? state : "dirty"));
  }, [readOnly]);

  const commit = useCallback(
    (next: Draft, group?: string) => {
      setHistory((current) => record(current, next, { group }));
      touch();
    },
    [touch],
  );

  /** Applies a document command. Refused commands leave everything as it was and explain why. */
  const run = useCallback(
    (command: DocumentCommand, options: { group?: string; quiet?: boolean; order?: CommandOptions["order"] } = {}): OpResult<QuoteDocument> => {
      if (readOnly) return { ok: false, message: "Il preventivo è in sola lettura." };
      const current = latest.current;
      const result = applyCommand(current.document, command, { order: options.order ?? order });
      if (!result.ok) {
        if (!options.quiet) toast.error(result.message);
        return result;
      }
      if (result.value !== current.document) {
        const next = { ...current, document: result.value };
        latest.current = next;
        commit(next, options.group);
      }
      return result;
    },
    [commit, order, readOnly],
  );

  const changeMeta = useCallback(
    (patch: Partial<Meta>) => {
      if (readOnly) return;
      const current = latest.current;
      const next = { ...current, meta: { ...current.meta, ...patch } };
      latest.current = next;
      commit(next, `meta:${Object.keys(patch).sort().join(",")}`);
    },
    [commit, readOnly],
  );

  const step = useCallback(
    (direction: "undo" | "redo") => {
      if (readOnly) return;
      const next = direction === "undo" ? undoStep(history) : redoStep(history);
      if (next === history) return;
      latest.current = next.present;
      setHistory(next);
      touch();
    },
    [history, readOnly, touch],
  );
  const undo = useCallback(() => step("undo"), [step]);
  const redo = useCallback(() => step("redo"), [step]);

  // The selection follows undo and redo: a block that no longer exists is never selected.
  const selected = document.blocks.find((block) => block.id === selectedId) ?? null;
  const effectiveSelectedId = selected ? selected.id : (document.blocks[0]?.id ?? null);

  const fiscal = data.snapshot.fiscal;
  const localTotals = useMemo(() => computeTotals(document, fiscal), [document, fiscal]);
  /** The server figure whenever it belongs to what is on screen; the same pure function otherwise. */
  const totals = server.document === document ? server.totals : localTotals;

  return {
    document,
    meta,
    selectedId: effectiveSelectedId,
    /** The selection as chosen, null included: the visual editor can have nothing selected. */
    selection: selected ? selected.id : null,
    selected: selected ?? document.blocks[0] ?? null,
    setSelectedId,
    run,
    changeMeta,
    undo,
    redo,
    canUndo: !readOnly && history.past.length > 0,
    canRedo: !readOnly && history.future.length > 0,
    totals,
    totalsFromServer: server.document === document,
    save,
    saveState,
    saveError,
    savedAt,
    revision,
    unsaved: saveState === "dirty" || saveState === "saving",
  };
}

export type QuoteDraft = ReturnType<typeof useQuoteDraft>;

/** Ctrl or Cmd + Z, Ctrl or Cmd + Shift + Z, Ctrl + Y. Ignored inside dialogs. */
export function useUndoShortcuts(draft: Pick<QuoteDraft, "undo" | "redo">, enabled: boolean) {
  const { undo, redo } = draft;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const isUndo = key === "z" && !event.shiftKey;
      const isRedo = (key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey && !event.metaKey);
      if (!isUndo && !isRedo) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[role='dialog'], [data-native-undo]")) return;
      event.preventDefault();
      if (isUndo) undo();
      else redo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, undo, redo]);
}
