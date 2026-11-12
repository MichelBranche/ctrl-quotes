"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useMediaQuery } from "@/lib/use-media-query";

export type EditorMode = "modulo" | "visuale";

/** The visual editor needs room and a precise pointer. */
export const visualeMedia = "(min-width: 1180px) and (pointer: fine)";

const storageKey = "cq.editor.mode";
const changeEvent = "cq-editor-mode";
/** Fallback when the browser blocks storage: the choice lasts until the page is closed. */
let memory: EditorMode | null = null;

function readStored(): EditorMode {
  try {
    const value = window.localStorage.getItem(storageKey);
    if (value === "visuale" || value === "modulo") return value;
  } catch {
    // Storage blocked: use the in-memory choice.
  }
  return memory ?? "modulo";
}

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(changeEvent, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(changeEvent, notify);
  };
}

/**
 * Modulo the first time, then the last mode used on this browser. The visual editor opens only
 * with the flag on (see server/flags.ts) and on a desktop-sized screen with a mouse or trackpad;
 * otherwise Modulo.
 */
export function useEditorMode(enabled: boolean) {
  const capable = useMediaQuery(visualeMedia);
  const stored = useSyncExternalStore(subscribe, readStored, () => "modulo" as EditorMode);
  const choose = useCallback((mode: EditorMode) => {
    memory = mode;
    try {
      window.localStorage.setItem(storageKey, mode);
    } catch {
      // Storage blocked: the in-memory choice is enough for this page.
    }
    window.dispatchEvent(new Event(changeEvent));
  }, []);
  const mode: EditorMode = enabled && capable && stored === "visuale" ? "visuale" : "modulo";
  return { mode, choose, enabled, capable };
}
