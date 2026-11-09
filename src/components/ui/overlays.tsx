"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { messages } from "@/i18n/it";
import { Button } from "@/components/ui/button";

type DialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  variant?: "dialog" | "drawer";
};

export function Dialog({ open, title, onClose, children, variant = "dialog" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || "closedBy" in HTMLDialogElement.prototype) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!dialog.open) return;
      const bounds = dialog.getBoundingClientRect();
      const outside =
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom;
      if (outside) dialog.close();
    };
    dialog.addEventListener("pointerdown", onPointerDown);
    return () => dialog.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <dialog
      ref={ref}
      className={variant === "drawer" ? "drawer" : undefined}
      aria-labelledby={titleId}
      closedby="any"
      onClose={onClose}
    >
      <div className={variant === "drawer" ? "drawer-panel" : "dialog-panel"}>
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

export function ConfirmationDialog({
  open,
  title,
  body,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <p>{body}</p>
      <div className="stack">
        <Button variant="secondary" onClick={onClose} autoFocus>
          Annulla
        </Button>
        <Button
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          Conferma
        </Button>
      </div>
    </Dialog>
  );
}

export function Drawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} title={title} onClose={onClose} variant="drawer">
      {children}
      <button type="button" className="btn btn-secondary" onClick={onClose}>
        {messages.shell.closeMenu}
      </button>
    </Dialog>
  );
}
