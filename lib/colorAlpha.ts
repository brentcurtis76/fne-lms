/**
 * A colour made see-through, for the places that used to glue two hex characters onto a colour string
 * (`${color}20`). Since the platform redesign's phase 4b some of those colours are named values,
 * `rgb(var(--color-x))`, and gluing characters onto a name would stop it being a colour at all.
 *
 * - A named value `rgb(var(--name))` becomes `rgb(var(--name) / <alpha>)`, the alpha being the two hex
 *   characters as a fraction of 255, with four decimals (enough to round back to the same 8-bit value).
 *   The same for a named value with a fallback (phase 5a): `rgb(var(--a, var(--b)))` becomes
 *   `rgb(var(--a, var(--b)) / <alpha>)`, and `rgb(var(--a, 10 10 10))` becomes `rgb(var(--a, 10 10 10) / <alpha>)`.
 * - Anything else (the brand kit's colours stay hex) gets the two characters appended, exactly as before.
 */
// `rgb(var(--name))`, and since phase 5a also a name with a fallback: `rgb(var(--name, var(--other)))` or
// `rgb(var(--name, 10 10 10))` (a chart series of the new look, whose fallback is today's colour).
const NAMED = /^rgb\((var\(--[A-Za-z0-9_-]+(?:, (?:var\(--[A-Za-z0-9_-]+\)|\d{1,3} \d{1,3} \d{1,3}))?\))\)$/;
const TWO_HEX = /^[0-9a-fA-F]{2}$/;

/** `20` → `0.1255`: the fraction of 255 the two hex characters stand for. */
export function alphaFromHex(hh: string): string {
  if (!TWO_HEX.test(hh)) throw new Error(`withAlpha expects two hex characters, got "${hh}"`);
  return String(Number((parseInt(hh, 16) / 255).toFixed(4)));
}

export function withAlpha(color: string, hh: string): string {
  const alpha = alphaFromHex(hh);
  const named = NAMED.exec(color.trim());
  if (named) return `rgb(${named[1]} / ${alpha})`;
  return `${color}${hh}`;
}
