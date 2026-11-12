/**
 * Undo and redo for the quote editor. Pure and generic: the editor stores `{ document, meta }`.
 * Typing in the same place within a short window becomes one step, like in a text editor.
 */

export const HISTORY_LIMIT = 100;
export const GROUP_MS = 800;

export type History<T> = {
  past: T[];
  present: T;
  future: T[];
  /** Last grouped change, so fast typing in one place merges into a single step. */
  group: { key: string; at: number } | null;
};

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], group: null };
}

export function record<T>(history: History<T>, next: T, options: { group?: string; now?: number } = {}): History<T> {
  if (Object.is(next, history.present)) return history;
  const now = options.now ?? Date.now();
  const { group } = options;
  if (group && history.group && history.group.key === group && now - history.group.at < GROUP_MS) {
    return { past: history.past, present: next, future: [], group: { key: group, at: now } };
  }
  const past = [...history.past, history.present];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, present: next, future: [], group: group ? { key: group, at: now } : null };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future], group: null };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...future] = history.future;
  if (next === undefined) return history;
  return { past: [...history.past, history.present], present: next, future, group: null };
}

/** Replaces the present without a new step, e.g. after a server restore. */
export function reset<T>(present: T): History<T> {
  return createHistory(present);
}
