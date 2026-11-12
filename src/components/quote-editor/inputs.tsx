"use client";

import { useId, useState } from "react";
import { centsToInput, parseEuroToCents, parseQuantity } from "@/domain/catalog";
import { cn } from "@/lib/cn";

function wrap<T>(value: T | null): { value: T } | null {
  return value === null ? null : { value };
}

/** Text input that keeps what the user types and only reports values that parse. */
function ParsedInput<T>({
  label,
  value,
  format,
  parse,
  onValue,
  inputMode,
  suffix,
  className,
  errorText,
}: {
  label: string;
  value: T;
  format: (value: T) => string;
  /** Null means the text is not valid yet. */
  parse: (raw: string) => { value: T } | null;
  onValue: (value: T) => void;
  inputMode: "decimal" | "numeric";
  suffix?: string;
  className?: string;
  errorText: string;
}) {
  const id = useId();
  const [text, setText] = useState(format(value));
  const [lastValue, setLastValue] = useState(value);
  const [invalid, setInvalid] = useState(false);
  if (value !== lastValue) {
    setLastValue(value);
    setText(format(value));
    setInvalid(false);
  }
  return (
    <div className={cn("field compact", invalid && "has-error", className)}>
      <label htmlFor={id}>{label}</label>
      <div className={suffix ? "input-suffix" : undefined}>
        <input
          id={id}
          inputMode={inputMode}
          value={text}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(event) => {
            setText(event.target.value);
            const parsed = parse(event.target.value);
            setInvalid(parsed === null);
            if (parsed !== null) {
              setLastValue(parsed.value);
              onValue(parsed.value);
            }
          }}
          onBlur={() => {
            if (!invalid) setText(format(lastValue));
          }}
        />
        {suffix ? <span aria-hidden="true">{suffix}</span> : null}
      </div>
      {invalid ? (
        <span id={`${id}-error`} className="field-error" role="alert">
          {errorText}
        </span>
      ) : null}
    </div>
  );
}

export function MoneyInput({ label, cents, onCents }: { label: string; cents: number; onCents: (cents: number) => void }) {
  return (
    <ParsedInput
      label={label}
      value={cents}
      format={centsToInput}
      parse={(raw) => wrap(parseEuroToCents(raw))}
      onValue={onCents}
      inputMode="decimal"
      suffix="€"
      errorText="Importo non valido, per esempio 1.200,50."
    />
  );
}

export function QuantityInput({ label, milli, onMilli }: { label: string; milli: number; onMilli: (milli: number) => void }) {
  return (
    <ParsedInput
      label={label}
      value={milli}
      format={(value) => String(value / 1000).replace(".", ",")}
      parse={(raw) => wrap(parseQuantity(raw))}
      onValue={onMilli}
      inputMode="decimal"
      errorText="Quantità maggiore di zero, massimo 3 decimali."
    />
  );
}

export function PercentInput({ label, bp, onBp, max = 10000 }: { label: string; bp: number; onBp: (bp: number) => void; max?: number }) {
  return (
    <ParsedInput
      label={label}
      value={bp}
      format={(value) => String(value / 100).replace(".", ",")}
      parse={(raw) => {
        const value = raw.replace(",", ".").replace("%", "").trim();
        if (value === "") return { value: 0 };
        if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
        const result = Math.round(Number(value) * 100);
        return result <= max ? { value: result } : null;
      }}
      onValue={onBp}
      inputMode="decimal"
      suffix="%"
      errorText={`Percentuale tra 0 e ${max / 100}.`}
    />
  );
}

export function IntInput({ label, value, onValue, min, max, hint }: { label: string; value: number | null; onValue: (value: number | null) => void; min: number; max: number; hint?: string }) {
  return (
    <ParsedInput
      label={label}
      value={value}
      format={(current) => (current === null ? "" : String(current))}
      parse={(raw) => {
        const trimmed = raw.trim();
        if (trimmed === "") return { value: null };
        if (!/^\d+$/.test(trimmed)) return null;
        const parsed = Number(trimmed);
        return parsed >= min && parsed <= max ? { value: parsed } : null;
      }}
      onValue={onValue}
      inputMode="numeric"
      errorText={hint ?? `Valore tra ${min} e ${max}.`}
    />
  );
}
