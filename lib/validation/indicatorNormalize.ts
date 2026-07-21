/**
 * Shared text normalization for indicator string fields.
 * Keeps the PUT and POST handlers consistent: trim strings, treat an emptied or
 * absent value as a cleared (null) column. Non-string, non-nullish values pass
 * through unchanged (validation elsewhere rejects wrong types).
 */
export function normalizeIndicatorText(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  return value;
}
