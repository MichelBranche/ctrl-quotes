/** Half-up division for integer money. Denominator must be non-zero. */
export function roundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator === 0) {
    throw new Error("L'arrotondamento richiede interi e un divisore diverso da zero.");
  }
  const negative = numerator < 0 !== denominator < 0;
  const n = BigInt(Math.abs(numerator));
  const d = BigInt(Math.abs(denominator));
  const rounded = (n + d / BigInt(2)) / d;
  const value = Number(rounded);
  return negative ? -value : value;
}

export function formatEuro(cents: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
