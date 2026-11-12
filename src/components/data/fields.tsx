"use client";

import { useId, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function TextAreaField({
  label,
  hint,
  error,
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string }) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div className={cn("field", error && "has-error")}>
      <label htmlFor={fieldId}>{label}</label>
      {hint ? (
        <span id={`${fieldId}-hint`} className="field-hint">
          {hint}
        </span>
      ) : null}
      <textarea id={fieldId} aria-describedby={hint ? `${fieldId}-hint` : undefined} aria-invalid={error ? true : undefined} {...props} />
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="alert" role="alert">
      {message}
    </p>
  );
}

/** Reads a FormData entry as trimmed text. */
export function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}
