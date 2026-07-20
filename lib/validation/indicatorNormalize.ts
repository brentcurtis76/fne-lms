/**
 * Shared text normalization for indicator string fields.
 * Keeps the PUT and POST handlers consistent: trim strings, and treat an
 * emptied string as a cleared (null) column. Non-string values pass through
 * unchanged (validation elsewhere rejects wrong types).
 */
export function normalizeIndicatorText(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === 'string') return value.trim() || null;
  return value;
}
