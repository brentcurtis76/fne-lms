/**
 * Cuota arithmetic for the contract form (GES-2.7).
 *
 * Amounts are handled in whole units of the currency — hundredths for UF,
 * whole pesos for CLP — so a split always adds up to the total exactly and a
 * comparison needs no floating-point tolerance.
 */

export type Currency = 'UF' | 'CLP';

/** Decimals a currency's amounts carry: 2 for UF, 0 for CLP. */
export function decimalsFor(currency: Currency | string | undefined): number {
  return currency === 'CLP' ? 0 : 2;
}

const toUnits = (amount: number, decimals: number): number =>
  Math.round((Number(amount) || 0) * 10 ** decimals);

const fromUnits = (units: number, decimals: number): number => units / 10 ** decimals;

/**
 * Split `total` into `n` cuotas: every cuota the same (rounded down to the
 * currency's units) except the last, which takes the remainder.
 */
export function splitEvenly(total: number, n: number, decimals: number): number[] {
  if (!Number.isInteger(n) || n <= 0) return [];
  const totalUnits = toUnits(total, decimals);
  const base = Math.floor(totalUnits / n);
  const parts: number[] = Array(n - 1).fill(fromUnits(base, decimals));
  parts.push(fromUnits(totalUnits - base * (n - 1), decimals));
  return parts;
}

const sumUnits = (amounts: number[], decimals: number): number =>
  amounts.reduce((sum, amount) => sum + toUnits(amount, decimals), 0);

/** True when the amounts add up to the total in whole units of the currency. */
export function sumsMatch(total: number, amounts: number[], decimals: number): boolean {
  return toUnits(total, decimals) === sumUnits(amounts, decimals);
}

/** Total minus the sum of the amounts, in the currency's units (for the «Diferencia» warning). */
export function difference(total: number, amounts: number[], decimals: number): number {
  return fromUnits(toUnits(total, decimals) - sumUnits(amounts, decimals), decimals);
}
