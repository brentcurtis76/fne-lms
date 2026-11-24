/**
 * Addresses, ids and search words. Pure helpers, safe in the browser.
 */

/** The same shape the database accepts (email_add_contacts, step a). */
const ADDRESS = /^[^\s\p{Cc}@<>,;]+@[^\s\p{Cc}@<>,;]+\.[^\s\p{Cc}@<>,;]+$/u;

export function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidAddress(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 254 && ADDRESS.test(trimmed);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/**
 * A list of ids from a request body: an array of 1..max distinct uuids, or null when the value is anything else
 * (not an array, empty, too long, or holding something that is not a uuid).
 */
export function readIds(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return null;
  if (!value.every(isUuid)) return null;
  return [...new Set(value.map((id) => id.toLowerCase()))];
}

/**
 * Search words safe to put inside a PostgREST `or=(…ilike…)` filter: the characters that filter syntax or
 * LIKE give a meaning to are dropped, spaces are kept, at most 100 characters. Empty means "no search".
 */
export function searchTerm(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[,()"'\\%*_:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

/** `col.ilike.*term*` for each column, joined for `.or()`. Call only with a non-empty `searchTerm` result. */
export function ilikeAny(columns: readonly string[], term: string): string {
  return columns.map((column) => `${column}.ilike.*${term}*`).join(',');
}

/** A 1-based page number from a query value; anything else is page 1. */
export function readPage(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(typeof raw === 'string' ? raw : '', 10);
  return Number.isSafeInteger(page) && page >= 1 && page <= 100_000 ? page : 1;
}
