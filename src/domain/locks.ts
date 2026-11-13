import { blockLabel, type QuoteBlock, type QuoteDocument } from "@/domain/quote-document";
import { canonicalJson } from "@/domain/quote-snapshot";

/**
 * The lock on the server. The editors already refuse to edit a locked block; this check makes the
 * save refuse it too, whatever the client sends.
 *
 * The draft is saved in batches (autosave), so a single save may carry "unlock, then edit" or
 * "edit, then lock". The rule that holds for any batch: a block that is locked both in the stored
 * draft and in the incoming one keeps its content. Moving it, hiding it, placing it in a row of
 * columns and copying it stay allowed, as in the editor.
 */

/** What a locked block may change: its place in a row, whether it prints, and the lock itself. */
const freeKeys = new Set(["col", "visible", "locked"]);

function content(block: QuoteBlock): string {
  return canonicalJson(Object.fromEntries(Object.entries(block).filter(([key]) => !freeKeys.has(key))));
}

/** The first block locked before and after whose content changed, or null. */
export function lockedChange(before: QuoteDocument, after: QuoteDocument): QuoteBlock | null {
  const stored = new Map(before.blocks.filter((block) => block.locked).map((block) => [block.id, block]));
  if (stored.size === 0) return null;
  for (const block of after.blocks) {
    const previous = stored.get(block.id);
    if (!previous || !block.locked) continue;
    if (previous.type !== block.type || content(previous) !== content(block)) return previous;
  }
  return null;
}

export function lockedChangeMessage(block: QuoteBlock): string {
  const name = "heading" in block && typeof block.heading === "string" && block.heading.trim() ? block.heading.trim() : blockLabel[block.type];
  return `Il blocco "${name}" è bloccato: sbloccalo dalla struttura per modificarlo.`;
}
