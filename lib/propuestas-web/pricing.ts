/**
 * The ONE price of a proposal (LIC-E6).
 *
 * Used by the configuration panel, the PDF generator, the public page's price
 * section and the generate route, so the three surfaces can never show three
 * different totals:
 *   - «Por hora»: hourly rate × hours.
 *   - «Precio fijo»: the fixed price; left blank it is 0 (never rate × hours).
 * A value written as text (the panel's inputs) is read as a number; any other
 * text counts as 0. Negative values are returned as they are: the route refuses
 * a total of zero or less.
 */

export interface PricingForTotal {
  // Optional only for the route's inferred body type; anything but 'per_hour' is a fixed price.
  mode?: 'per_hour' | 'fixed';
  precioUf?: number | string | null;
  totalHours: number | string | null | undefined;
  fixedUf?: number | string | null;
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function totalUf(pricing: PricingForTotal): number {
  if (pricing.mode === 'per_hour') {
    return toNumber(pricing.precioUf) * toNumber(pricing.totalHours);
  }
  return toNumber(pricing.fixedUf);
}
