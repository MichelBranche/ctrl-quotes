"use client";

import { messages } from "@/i18n/it";
import { passwordStrength, type StrengthLabel } from "@/domain/password-strength";

const labels: Record<StrengthLabel, string> = {
  debole: messages.auth.strengthDebole,
  discreta: messages.auth.strengthDiscreta,
  buona: messages.auth.strengthBuona,
  ottima: messages.auth.strengthOttima,
};

export function PasswordStrengthMeter({ value }: { value: string }) {
  const result = passwordStrength(value);
  return (
    <div className="pwd-strength" data-level={result.level} aria-live="polite">
      <div className="pwd-strength-row">
        <div className="pwd-strength-bar" role="meter" aria-label={messages.auth.passwordStrength} aria-valuemin={0} aria-valuemax={4} aria-valuenow={result.level} aria-valuetext={result.label ? labels[result.label] : undefined}>
          {([1, 2, 3, 4] as const).map((segment) => (
            <span key={segment} className={segment <= result.level ? "is-on" : undefined} aria-hidden="true">
              <span />
            </span>
          ))}
        </div>
        <span className="pwd-strength-label">{result.label ? labels[result.label] : ""}</span>
      </div>
      {result.hint ? <p className="pwd-strength-hint">{result.hint}</p> : null}
    </div>
  );
}
