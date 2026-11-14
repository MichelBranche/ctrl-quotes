"use server";

import { refresh } from "next/cache";
import { requireContext } from "@/server/context";
import { commitClientImport, previewClientImport, type ImportPreviewResult } from "@/server/client-import";
import {
  addNote,
  createClient,
  deleteClient,
  deleteContact,
  deleteNote,
  saveContact,
  setClientArchived,
  setClientsArchived,
  updateClient,
} from "@/server/clients";
import { toAction, type ActionResult } from "@/server/actions/result";

function id(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 64) : "";
}

export async function createClientAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { db, actor } = await requireContext();
  const result = await createClient(db, actor, input);
  if (result.ok) refresh();
  return toAction(result, "Cliente creato.");
}

export async function updateClientAction(clientId: unknown, input: unknown): Promise<ActionResult<{ id: string }>> {
  const { db, actor } = await requireContext();
  const result = await updateClient(db, actor, id(clientId), input);
  if (result.ok) refresh();
  return toAction(result, "Cliente aggiornato.");
}

export async function archiveClientAction(clientId: unknown, archived: unknown): Promise<ActionResult<{ id: string }>> {
  const { db, actor } = await requireContext();
  const result = await setClientArchived(db, actor, id(clientId), archived === true);
  if (result.ok) refresh();
  return toAction(result, archived === true ? "Cliente archiviato." : "Cliente ripristinato.");
}

export async function archiveClientsAction(clientIds: unknown, archived: unknown): Promise<ActionResult<{ count: number }>> {
  const { db, actor } = await requireContext();
  const ids = Array.isArray(clientIds) ? clientIds.map(id) : [];
  const result = await setClientsArchived(db, actor, ids, archived === true);
  if (result.ok) refresh();
  return toAction(result, archived === true ? "Clienti archiviati." : "Clienti ripristinati.");
}

export async function deleteClientAction(clientId: unknown): Promise<ActionResult<{ id: string }>> {
  const { db, actor } = await requireContext();
  const result = await deleteClient(db, actor, id(clientId));
  if (result.ok) refresh();
  return toAction(result, "Cliente eliminato.");
}

export async function saveContactAction(
  clientId: unknown,
  contactId: unknown,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { db, actor } = await requireContext();
  const result = await saveContact(db, actor, id(clientId), contactId ? id(contactId) : null, input);
  if (result.ok) refresh();
  return toAction(result, contactId ? "Contatto aggiornato." : "Contatto aggiunto.");
}

export async function deleteContactAction(clientId: unknown, contactId: unknown): Promise<ActionResult<{ id: string }>> {
  const { db, actor } = await requireContext();
  const result = await deleteContact(db, actor, id(clientId), id(contactId));
  if (result.ok) refresh();
  return toAction(result, "Contatto eliminato.");
}

export async function addNoteAction(clientId: unknown, input: unknown): Promise<ActionResult<{ id: string }>> {
  const { db, actor } = await requireContext();
  const result = await addNote(db, actor, id(clientId), input);
  if (result.ok) refresh();
  return toAction(result, "Nota aggiunta.");
}

export async function deleteNoteAction(clientId: unknown, noteId: unknown): Promise<ActionResult<{ id: string }>> {
  const { db, actor } = await requireContext();
  const result = await deleteNote(db, actor, id(clientId), id(noteId));
  if (result.ok) refresh();
  return toAction(result, "Nota eliminata.");
}

export async function previewImportAction(text: unknown, mapping: unknown): Promise<ActionResult<ImportPreviewResult>> {
  const { db, actor } = await requireContext();
  return toAction(await previewClientImport(db, actor, text, mapping));
}

export async function commitImportAction(
  text: unknown,
  mapping: unknown,
): Promise<ActionResult<{ imported: number; duplicates: number; errors: number }>> {
  const { db, actor } = await requireContext();
  const result = await commitClientImport(db, actor, text, mapping);
  if (result.ok) refresh();
  return toAction(result);
}
