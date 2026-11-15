"use client";

import type { EditAnchor } from "@/domain/document-ops";
import type { Kit, TextProps, ViewProps } from "./kit";
import { WebT, WebV, webKit, type AnchorAttrs } from "./kit-web";

/**
 * Web kit for the visual editor: same DOM as the preview, plus data attributes on every element
 * that prints a stored value, so the editor knows which field a click or a keystroke belongs to.
 * The PDF and the normal web kit never see these attributes.
 */

export const anchorAttributes = {
  block: "data-edit-block",
  field: "data-edit-field",
  kind: "data-edit-kind",
} as const;

export function anchorAttrs(edit: EditAnchor | undefined): AnchorAttrs | undefined {
  if (!edit) return undefined;
  return { [anchorAttributes.block]: edit.blockId, [anchorAttributes.field]: edit.field, [anchorAttributes.kind]: edit.kind };
}

/** Reads the anchor of an element printed by the edit kit, or of its closest anchored ancestor. */
export function readAnchor(element: Element | null): EditAnchor | null {
  const node = element?.closest(`[${anchorAttributes.field}]`);
  if (!node) return null;
  const blockId = node.getAttribute(anchorAttributes.block);
  const field = node.getAttribute(anchorAttributes.field);
  const kind = node.getAttribute(anchorAttributes.kind);
  if (!blockId || !field || (kind !== "line" && kind !== "multiline" && kind !== "money" && kind !== "quantity")) return null;
  return { blockId, field: field as EditAnchor["field"], kind };
}

function EditV({ edit, ...props }: ViewProps) {
  return <WebV {...props} anchor={anchorAttrs(edit)} />;
}

function EditT({ edit, ...props }: TextProps) {
  // Links print as text in the editor: a click there means "edit", never "leave the page".
  return <WebT {...props} anchor={anchorAttrs(edit)} inert />;
}

export const editKit: Kit = { ...webKit, V: EditV, T: EditT };
