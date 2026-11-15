"use client";

import { Archive, Trash2 } from "lucide-react";
import FuseButton from "./reactbits/FuseButton";
import HoldButton from "./reactbits/HoldButton";

/**
 * Destructive actions, by how final they are.
 * - FuseAction: reversible (archive, delete a block). A fuse burns for a few seconds with
 *   "Annulla"; the action runs when it ends.
 * - HoldDelete: permanent. Press and hold until the fill completes, no extra confirm click.
 */

const tones = { violet: "#7C3AED", amber: "#F59E0B", danger: "#DC2626" } as const;

export function FuseAction({
  kind,
  onCommit,
  onUndo,
  disabled,
  size = "sm",
  tone,
  label,
  className,
}: {
  kind: "archive" | "delete" | "remove";
  onCommit: () => void;
  onUndo?: () => void;
  disabled?: boolean;
  size?: "sm" | "md";
  tone?: keyof typeof tones;
  label?: string;
  className?: string;
}) {
  const text = { archive: ["Archivia", "Archiviato"], delete: ["Elimina", "Eliminato"], remove: ["Rimuovi", "Rimosso"] }[kind];
  return (
    <FuseButton
      label={label ?? text[0]}
      doneLabel={text[1]}
      undoLabel="Annulla"
      icon={kind === "archive" ? <Archive size={14} aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
      color="var(--cq-ink)"
      background="var(--cq-surface)"
      fuseColor={tones[tone ?? (kind === "archive" ? "amber" : "violet")]}
      size={size}
      radius={10}
      fuseThickness={2}
      undoWindow={4000}
      commitOn="fuseEnd"
      pauseOnHover={false}
      disabled={disabled}
      onCommit={onCommit}
      onUndo={onUndo}
      className={`cq-fuse${className ? ` ${className}` : ""}`}
    />
  );
}

export function HoldDelete({ onHold, disabled, label = "Tieni premuto per eliminare", doneLabel = "Eliminato", tone = "danger", size = "md", className }: { onHold: () => void; disabled?: boolean; label?: string; doneLabel?: string; tone?: "danger" | "violet"; size?: "sm" | "md"; className?: string }) {
  return (
    <HoldButton
      icon={<Trash2 size={15} aria-hidden="true" />}
      doneLabel={doneLabel}
      backgroundColor="var(--cq-surface-sunken)"
      textColor={tone === "danger" ? "#B91C1C" : "var(--cq-ink)"}
      fillColor={tones[tone]}
      fillTextColor="#FFFFFF"
      size={size}
      radius={10}
      holdTime={1500}
      resetAfter={1600}
      disabled={disabled}
      onHold={onHold}
      className={`cq-hold${className ? ` ${className}` : ""}`}
    >
      {label}
    </HoldButton>
  );
}
