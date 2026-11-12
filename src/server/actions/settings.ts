"use server";

import { refresh } from "next/cache";
import { requireContext } from "@/server/context";
import { removeLogo, saveBrand, saveFiscal, saveNumbering, saveTerms, setLogo } from "@/server/settings";
import { changeMemberRole, removeMember } from "@/server/team";
import { setDefaultTemplate, toggleFavorite } from "@/server/templates";
import { toAction, type ActionResult } from "@/server/actions/result";
import { logoLimits } from "@/domain/brand";

function id(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 64) : "";
}

export async function saveBrandAction(input: unknown): Promise<ActionResult> {
  const { db, actor } = await requireContext();
  const result = await saveBrand(db, actor, input);
  if (result.ok) refresh();
  return toAction(result, "Brand Kit salvato.");
}

export async function uploadLogoAction(formData: FormData): Promise<ActionResult<{ assetId: string }>> {
  const { db, actor } = await requireContext();
  const file = formData.get("logo");
  if (!(file instanceof File)) return { ok: false, message: "Scegli un file." };
  if (file.size > logoLimits.maxBytes) return { ok: false, message: "Il logo supera 1 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await setLogo(db, actor, { bytes, filename: file.name });
  if (result.ok) refresh();
  return toAction(result, "Logo caricato.");
}

export async function removeLogoAction(): Promise<ActionResult> {
  const { db, actor } = await requireContext();
  const result = await removeLogo(db, actor);
  if (result.ok) refresh();
  return toAction(result, "Logo rimosso.");
}

export async function saveFiscalAction(input: unknown): Promise<ActionResult> {
  const { db, actor } = await requireContext();
  const result = await saveFiscal(db, actor, input);
  if (result.ok) refresh();
  return toAction(result, "Impostazioni fiscali salvate.");
}

export async function saveNumberingAction(input: unknown): Promise<ActionResult> {
  const { db, actor } = await requireContext();
  const result = await saveNumbering(db, actor, input);
  if (result.ok) refresh();
  return toAction(result, "Numerazione salvata.");
}

export async function saveTermsAction(input: unknown): Promise<ActionResult> {
  const { db, actor } = await requireContext();
  const result = await saveTerms(db, actor, input);
  if (result.ok) refresh();
  return toAction(result, "Condizioni salvate.");
}

export async function toggleFavoriteAction(templateId: unknown): Promise<ActionResult<{ favorite: boolean }>> {
  const { db, actor } = await requireContext();
  const result = await toggleFavorite(db, actor, id(templateId));
  if (result.ok) refresh();
  return toAction(result);
}

export async function setDefaultTemplateAction(templateId: unknown): Promise<ActionResult> {
  const { db, actor } = await requireContext();
  const result = await setDefaultTemplate(db, actor, id(templateId));
  if (result.ok) refresh();
  return toAction(result, "Template predefinito aggiornato.");
}

export async function changeRoleAction(userId: unknown, role: unknown): Promise<ActionResult> {
  const { db, actor } = await requireContext();
  const result = await changeMemberRole(db, actor, id(userId), role);
  if (result.ok) refresh();
  return toAction(result, "Ruolo aggiornato.");
}

export async function removeMemberAction(userId: unknown): Promise<ActionResult> {
  const { db, actor } = await requireContext();
  const result = await removeMember(db, actor, id(userId));
  if (result.ok) refresh();
  return toAction(result, "Membro rimosso.");
}
