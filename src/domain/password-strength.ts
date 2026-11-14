/** Client-side password strength, for the sign-up meter only. It never tightens the submit rules. */

export type StrengthLabel = "debole" | "discreta" | "buona" | "ottima";

export type PasswordStrength = {
  /** 0 when empty, otherwise 1-4 filled segments. */
  level: 0 | 1 | 2 | 3 | 4;
  label: StrengthLabel | null;
  hint: string | null;
};

const COMMON = new Set(
  [
    "password",
    "password1",
    "password12",
    "password123",
    "passw0rd",
    "p@ssw0rd",
    "p@ssword",
    "12345678",
    "123456789",
    "1234567890",
    "01234567",
    "11111111",
    "00000000",
    "87654321",
    "qwerty",
    "qwerty1",
    "qwerty12",
    "qwerty123",
    "qwertyui",
    "qwertyuiop",
    "asdfasdf",
    "asdfghjk",
    "zxcvbnm",
    "abc123",
    "abc12345",
    "abcd1234",
    "iloveyou",
    "admin",
    "admin123",
    "welcome",
    "welcome1",
    "letmein",
    "monkey",
    "dragon",
    "football",
    "baseball",
    "starwars",
    "master",
    "login",
    "guest",
    "changeme",
    "ciao",
    "ciao123",
    "ciao1234",
    "benvenuto",
    "italia",
    "italia12",
    "italia123",
  ].map((item) => item.toLowerCase()),
);

const HINT = {
  length: "Allunga la password",
  number: "Aggiungi un numero",
  upper: "Aggiungi una lettera maiuscola",
  lower: "Aggiungi una lettera minuscola",
  symbol: "Aggiungi un simbolo",
  common: "Evita le password più comuni",
  repeat: "Evita i caratteri ripetuti",
} as const;

function hasRepeat(password: string): boolean {
  if (/(.)\1{2,}/.test(password)) return true;
  if (password.length < 6) return false;
  for (let size = 1; size <= Math.floor(password.length / 2); size += 1) {
    const chunk = password.slice(0, size);
    const times = Math.floor(password.length / size);
    if (times < 2) continue;
    if (chunk.repeat(times) === password.slice(0, size * times) && size * times >= password.length - 1) return true;
  }
  return false;
}

function hasSequence(password: string): boolean {
  const lower = password.toLowerCase();
  const rows = ["abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
  for (let i = 0; i <= lower.length - 4; i += 1) {
    const slice = lower.slice(i, i + 4);
    const reversed = [...slice].reverse().join("");
    if (rows.some((row) => row.includes(slice) || row.includes(reversed))) return true;
  }
  return false;
}

function isCommon(password: string): boolean {
  const normalized = password.trim().toLowerCase();
  if (COMMON.has(normalized)) return true;
  // "Password1!" and similar still count as a common base.
  const stripped = normalized.replace(/[^a-z0-9]/g, "");
  return stripped.length >= 6 && COMMON.has(stripped);
}

export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { level: 0, label: null, hint: null };

  const lower = /[a-z]/.test(password);
  const upper = /[A-Z]/.test(password);
  const digit = /[0-9]/.test(password);
  const symbol = /[^A-Za-z0-9]/.test(password);
  const common = isCommon(password);
  const repeated = hasRepeat(password);
  const sequential = hasSequence(password);

  let points = 0;
  if (password.length >= 8) points += 1;
  if (password.length >= 12) points += 1;
  if (password.length >= 16) points += 1;
  if (lower || upper) points += 1;
  if (lower && upper) points += 1;
  if (digit) points += 1;
  if (symbol) points += 1;
  if (repeated) points -= 1;
  if (sequential) points -= 1;

  if (password.length < 8 || common || repeated) points = Math.min(points, 1);
  points = Math.max(1, Math.min(4, points));
  if (points === 4 && password.length < 12) points = 3;

  const level = points as 1 | 2 | 3 | 4;
  const label: StrengthLabel = level === 1 ? "debole" : level === 2 ? "discreta" : level === 3 ? "buona" : "ottima";

  let hint: string | null = null;
  if (password.length < 8) hint = HINT.length;
  else if (common) hint = HINT.common;
  else if (repeated) hint = HINT.repeat;
  else if (!digit) hint = HINT.number;
  else if (!upper) hint = HINT.upper;
  else if (!lower) hint = HINT.lower;
  else if (!symbol) hint = HINT.symbol;
  else if (level < 4 && password.length < 12) hint = HINT.length;

  return { level, label, hint };
}
