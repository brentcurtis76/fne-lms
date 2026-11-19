/**
 * How a tender's amounts and durations are written in every tender document
 * and screen (LIC-B1, LIC-B4, LIC-B8).
 *
 * Amounts follow the convention of the contract templates
 * (lib/contract-template.ts): UF with two decimals («UF 1.200,50»), pesos with
 * none («$35.000.000»). A tender's currency is licitaciones.tipo_moneda; the
 * column monto_adjudicado_uf holds the amount in that currency despite its name.
 *
 * Pure and dependency-free on purpose: documents, routes and screens import it.
 */

/**
 * Writes an amount in the given currency, the Chilean way.
 * - 'UF'  → «UF 1.200,50» (always two decimals)
 * - 'CLP' → «$35.000.000» (no decimals, rounded)
 * - any other code → «<amount es-CL> <code>»; no code → the amount alone
 * - null, undefined, '' or a value that is not a number → `placeholder` (default '')
 */
export function formatMonto(
  amount: number | string | null | undefined,
  moneda: string | null | undefined,
  placeholder = ''
): string {
  if (amount === null || amount === undefined) return placeholder;
  if (typeof amount === 'string' && amount.trim() === '') return placeholder;
  const value = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(value)) return placeholder;

  const code = (moneda ?? '').trim();
  if (code === 'UF') {
    return `UF ${value.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (code === 'CLP') {
    return `$${value.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`;
  }
  const written = value.toLocaleString('es-CL');
  return code ? `${written} ${code}` : written;
}

/**
 * Writes a duration typed as free text. A bare number (e.g. «6», «1,5») gets
 * « meses» («1» → «1 mes»); any other text is returned as typed; an empty value
 * gives ''.
 */
export function formatDuracion(text: string | null | undefined): string {
  if (text === null || text === undefined) return '';
  const trimmed = String(text).trim();
  if (trimmed === '') return '';
  if (/^\d+([.,]\d+)?$/.test(trimmed)) {
    return trimmed === '1' ? '1 mes' : `${trimmed} meses`;
  }
  return text;
}
