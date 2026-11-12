"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Eye, EyeOff, Lock, Mail, UserRound } from "lucide-react";
import { messages } from "@/i18n/it";
import { cn } from "@/lib/cn";
import { formatEuro } from "@/domain/money";

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  forceState?: "hover" | "focus" | "error" | "disabled";
};

export function Field({ label, hint, error, children, forceState }: FieldProps) {
  const id = useId();
  return (
    <div
      className={cn(
        "field",
        (error || forceState === "error") && "has-error",
        forceState === "hover" && "is-hover",
        forceState === "focus" && "is-focus",
        forceState === "disabled" && "is-disabled",
      )}
    >
      <label htmlFor={id}>{label}</label>
      {hint ? <span id={`${id}-hint`} className="field-hint">{hint}</span> : null}
      <div data-field-id={id}>{children}</div>
      {error ? (
        <span id={`${id}-error`} className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  icon?: "mail" | "lock" | "user";
  forceState?: "hover" | "focus" | "error" | "disabled";
};

export function TextField({ label, hint, error, icon, forceState, id, ...props }: TextFieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const describedBy = [hint ? `${inputId}-hint` : "", error ? `${inputId}-error` : ""].filter(Boolean).join(" ") || undefined;
  const Icon = icon === "mail" ? Mail : icon === "lock" ? Lock : icon === "user" ? UserRound : null;
  return (
    <div className={cn("field", (error || forceState === "error") && "has-error", forceState && `is-${forceState}`)}>
      <label htmlFor={inputId}>{label}</label>
      {hint ? (
        <span id={`${inputId}-hint`} className="field-hint">
          {hint}
        </span>
      ) : null}
      <div className={Icon ? "input-icon" : undefined}>
        {Icon ? (
          <span className="leading-icon" aria-hidden="true">
            <Icon size={16} />
          </span>
        ) : null}
        <input id={inputId} aria-invalid={error ? true : undefined} aria-describedby={describedBy} disabled={forceState === "disabled" || props.disabled} {...props} />
      </div>
      {error ? (
        <span id={`${inputId}-error`} className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function PasswordField({ label, ...props }: Omit<TextFieldProps, "icon" | "type">) {
  const [visible, setVisible] = useState(false);
  const generated = useId();
  const inputId = props.id ?? generated;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      {props.hint ? (
        <span id={`${inputId}-hint`} className="field-hint">
          {props.hint}
        </span>
      ) : null}
      <div className="input-icon">
        <span className="leading-icon" aria-hidden="true">
          <Lock size={16} />
        </span>
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          aria-describedby={props.hint ? `${inputId}-hint` : undefined}
          autoComplete={props.autoComplete}
          name={props.name}
          required={props.required}
          minLength={props.minLength}
        />
        <button
          type="button"
          className="trailing-icon"
          aria-pressed={visible}
          aria-label={visible ? messages.auth.hidePassword : messages.auth.showPassword}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: Array<{ value: string; label: string }>;
};

export function SelectField({ label, options, id, ...props }: SelectFieldProps) {
  const generated = useId();
  const selectId = id ?? generated;
  return (
    <div className="field">
      <label htmlFor={selectId}>{label}</label>
      <select id={selectId} {...props}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CurrencyInput({
  label,
  cents,
  onCents,
  error,
}: {
  label: string;
  cents: number;
  onCents: (cents: number) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <div className={cn("field", error && "has-error")}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode="decimal"
        value={formatEuro(cents)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => {
          const digits = event.target.value.replace(/[^\d]/g, "");
          onCents(digits ? Number(digits) : 0);
        }}
      />
      {error ? (
        <span id={`${id}-error`} className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function DateField({ label, name }: { label: string; name: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type="date" />
    </div>
  );
}
