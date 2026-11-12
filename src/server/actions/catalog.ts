"use server";

import { refresh } from "next/cache";
import {
  createCatalogItem,
  createCategory,
  deleteCatalogItem,
  deleteCategory,
  duplicateCatalogItem,
  renameCategory,
  updateCatalogItem,
} from "@/server/catalog";
import { requireContext } from "@/server/context";
import { toAction, type ActionResult } from "@/server/actions/result";

function id(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 64) : "";
}

export async function saveCatalogItemAction(itemId: unknown, input: unknown): Promise<ActionResult<{ id: string }>> {
  const { db, actor } = await requireContext();
  const result = itemId ? await updateCatalogItem(db, actor, id(itemId), input) : await createCatalogItem(db, actor, input);
  if (result.ok) refresh();
  return toAction(result, itemId ? "Elemento aggiornato." : "Elemento creato.");
}

export async function duplicateCatalogItemAction(itemId: unknown): Promise<ActionResult<{ id: string }>> {
  const { db, actor } = await requireContext();
  const result = await duplicateCatalogItem(db, actor, id(itemId));
  if (result.ok) refresh();
  return toAction(result, "Elemento duplicato.");
}

export async function deleteCatalogItemAction(itemId: unknown): Promise<ActionResult<{ id: string }>> {
  const { db, actor } = await requireContext();
  const result = await deleteCatalogItem(db, actor, id(itemId));
  if (result.ok) refresh();
  return toAction(result, "Elemento eliminato.");
}

export async function createCategoryAction(name: unknown): Promise<ActionResult<{ id: string }>> {
  const { db, actor } = await requireContext();
  const result = await createCategory(db, actor, name);
  if (result.ok) refresh();
  return toAction(result, "Categoria creata.");
}

export async function renameCategoryAction(categoryId: unknown, name: unknown): Promise<ActionResult<{ id: string }>> {
  const { db, actor } = await requireContext();
  const result = await renameCategory(db, actor, id(categoryId), name);
  if (result.ok) refresh();
  return toAction(result, "Categoria rinominata.");
}

export async function deleteCategoryAction(categoryId: unknown): Promise<ActionResult<{ id: string }>> {
  const { db, actor } = await requireContext();
  const result = await deleteCategory(db, actor, id(categoryId));
  if (result.ok) refresh();
  return toAction(result, "Categoria eliminata.");
}
