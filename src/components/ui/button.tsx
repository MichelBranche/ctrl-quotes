"use client";

import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { messages } from "@/i18n/it";
import { cn } from "@/lib/cn";
import { BusyMark } from "@/components/ui/async-status";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  pill?: boolean;
  loading?: boolean;
  forceState?: "hover" | "active" | "focus" | "disabled";
};

export function Button({
  variant = "primary",
  pill = false,
  loading = false,
  forceState,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "btn",
        variant === "primary" && "btn-primary",
        variant === "secondary" && "btn-secondary",
        variant === "ghost" && "btn-ghost",
        pill && "btn-pill",
        forceState === "hover" && "is-hover",
        forceState === "active" && "is-active",
        forceState === "focus" && "is-focus",
        forceState === "disabled" && "is-disabled",
        className,
      )}
      disabled={disabled || forceState === "disabled" || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <BusyMark /> : null}
      {children}
    </button>
  );
}

export function FutureButton({ children, className }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const hintId = useId();
  return (
    <div>
      <button
        type="button"
        className={cn("btn btn-primary", className)}
        aria-disabled="true"
        aria-describedby={hintId}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      <p id={hintId} className={open ? "field-hint" : "visually-hidden"}>
        {messages.future.action}
      </p>
    </div>
  );
}
