"use server";

import { refresh } from "next/cache";
import { requireContext } from "@/server/context";
import {
  createQuote,
  createVersion,
  deleteQuote,
  duplicateQuote,
  linesFromCatalog,
  restoreVersion,
  saveDraft,
  uploadQuoteImage,
  type SaveDraftResult,
} from "@/server/quotes";
import { authorize } from "@/server/access";
import type { QuoteLine } from "@/domain/quote-document";
import { toAction, type ActionResult } from "@/server/actions/result";

function id(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 64) : "";
}

function int(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) ? value : -1;
}

export async function createQuoteAction(input: unknown): Promise<ActionResult<{ id: string; number: string }>> {
  const { db, actor } = await requireContext();
  const result = await createQuote(db, actor, input);
  return toAction(result, result.ok ? `Preventivo ${result.value.number} creato.` : undefined);
}

/** Autosave. No refresh: the editor keeps its own state and only takes the new revision and totals. */
export async function saveDraftAction(quoteId: unknown, input: unknown): Promise<ActionResult<SaveDraftResult>> {
  const { db, actor } = await requireContext();
  return toAction(await saveDraft(db, actor, id(quoteId), input));
}

export async function createVersionAction(
  quoteId: unknown,
  revision: unknown,
): Promise<ActionResult<{ id: string; versionNo: number; sha256: string }>> {
  const { db, actor } = await requireContext();
  const result = await createVersion(db, actor, id(quoteId), int(revision));
  if (result.ok) refresh();
  return toAction(result, result.ok ? `Versione ${result.value.versionNo} salvata.` : undefined);
}

export async function restoreVersionAction(
  quoteId: unknown,
  versionNo: unknown,
  revision: unknown,
): Promise<ActionResult<{ revision: number }>> {
  const { db, actor } = await requireContext();
  const result = await restoreVersion(db, actor, id(quoteId), int(versionNo), int(revision));
  if (result.ok) refresh();
  return toAction(result, "Versione ripristinata nella bozza.");
}

export async function duplicateQuoteAction(quoteId: unknown): Promise<ActionResult<{ id: string; number: string }>> {
  const { db, actor } = await requireContext();
  const result = await duplicateQuote(db, actor, id(quoteId));
  if (result.ok) refresh();
  return toAction(result, result.ok ? `Copia creata: ${result.value.number}.` : undefined);
}

export async function deleteQuoteAction(quoteId: unknown): Promise<ActionResult<{ id: string }>> {
  const { db, actor } = await requireContext();
  const result = await deleteQuote(db, actor, id(quoteId));
  if (result.ok) refresh();
  return toAction(result, "Preventivo eliminato.");
}

/** Catalog lines for the editor picker, copied with the same rules as the wizard. */
export async function catalogLinesAction(itemIds: unknown): Promise<ActionResult<QuoteLine[]>> {
  const { db, actor } = await requireContext();
  const access = await authorize(db, actor, "quotes.write");
  if (!access.ok) return toAction(access);
  const ids = Array.isArray(itemIds) ? itemIds.filter((value): value is string => typeof value === "string").slice(0, 50) : [];
  return toAction(await linesFromCatalog(db, actor.workspaceId, ids.map((value) => value.slice(0, 64))));
}

export async function uploadQuoteImageAction(quoteId: unknown, form: FormData): Promise<ActionResult<{ assetId: string }>> {
  const { db, actor } = await requireContext();
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Scegli un'immagine." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  return toAction(await uploadQuoteImage(db, actor, id(quoteId), { bytes, filename: file.name }), "Immagine caricata.");
}
