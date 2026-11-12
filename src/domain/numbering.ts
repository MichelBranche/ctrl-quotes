export type NumberFormatCheck = { ok: true } | { ok: false; message: string };

const counterToken = /\{(0{3,6})\}/g;

/**
 * Validates a quote number format. Tokens: {YYYY}, {YY} and exactly one counter
 * such as {0000}. Literal characters are limited to letters, digits and - _ / .
 */
export function checkNumberFormat(format: string): NumberFormatCheck {
  const value = format.trim();
  if (value.length < 4 || value.length > 40) {
    return { ok: false, message: "Il formato deve avere tra 4 e 40 caratteri." };
  }
  const counters = value.match(counterToken) ?? [];
  if (counters.length !== 1) {
    return { ok: false, message: "Il formato deve contenere un solo contatore, per esempio {0000}." };
  }
  const literals = value.replace(counterToken, "").replace(/\{YYYY\}|\{YY\}/g, "");
  if (literals.includes("{") || literals.includes("}")) {
    return { ok: false, message: "Segnaposto non riconosciuto. Usa {YYYY}, {YY} e {0000}." };
  }
  if (!/^[A-Za-z0-9\-_/.]*$/.test(literals)) {
    return { ok: false, message: "Usa solo lettere, cifre e i simboli - _ / ." };
  }
  return { ok: true };
}

export function formatQuoteNumber(format: string, year: number, value: number): string {
  return format
    .trim()
    .replace(/\{YYYY\}/g, String(year))
    .replace(/\{YY\}/g, String(year).slice(-2))
    .replace(counterToken, (_match, zeros: string) => String(value).padStart(zeros.length, "0"));
}

export const numberFormatPresets = ["QT-{YYYY}-{0000}", "{YYYY}/{000}", "PREV-{YY}-{0000}"] as const;
