/**
 * Addresses, ids and search words. Pure helpers, safe in the browser.
 */

/**
 * The characters the database strips from both ends of every cell and refuses inside an address: exactly the set
 * of `public.email_hidden_chars()` (migration 20261124200200): U+0009..U+000D, U+0020, U+0085, U+00A0, U+00AD,
 * U+1680, U+180E, U+2000..U+200F, U+2028..U+202F, U+205F..U+2064, U+2066..U+2069, U+3000, U+FEFF. JavaScript's
 * `trim()` and `\s` do not agree with it (they miss U+0085, U+00AD, U+180E, U+200B..U+200F, U+2060..U+2064, ...), so
 * the screens and routes use these helpers instead. Every one is a single UTF-16 unit.
 */
const HIDDEN_RANGES: readonly (readonly [number, number])[] = [
  [0x0009, 0x000d],
  [0x0020, 0x0020],
  [0x0085, 0x0085],
  [0x00a0, 0x00a0],
  [0x00ad, 0x00ad],
  [0x1680, 0x1680],
  [0x180e, 0x180e],
  [0x2000, 0x200f],
  [0x2028, 0x202f],
  [0x205f, 0x2064],
  [0x2066, 0x2069],
  [0x3000, 0x3000],
  [0xfeff, 0xfeff],
];

/** Whether a UTF-16 unit is one of the database's hidden characters. */
export function isHiddenChar(code: number): boolean {
  return HIDDEN_RANGES.some(([low, high]) => code >= low && code <= high);
}

/** The value without hidden characters at either end (the database's `btrim(value, email_hidden_chars())`). */
export function trimHidden(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && isHiddenChar(value.charCodeAt(start))) start += 1;
  while (end > start && isHiddenChar(value.charCodeAt(end - 1))) end -= 1;
  return value.slice(start, end);
}

/** A name or organisation cell as the database stores it: trimmed of hidden characters, empty is null. */
export function cleanCell(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  return trimHidden(value) || null;
}

/** The same shape the database accepts (email_add_contacts, step a). */
const ADDRESS = /^[^\s\p{Cc}@<>,;]+@[^\s\p{Cc}@<>,;]+\.[^\s\p{Cc}@<>,;]+$/u;
const CONTROL = /\p{Cc}/u;

function holdsHiddenOrControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (isHiddenChar(value.charCodeAt(index))) return true;
  }
  return CONTROL.test(value);
}

/** The address as the database compares it: hidden characters trimmed from both ends, lower case. */
export function normalizeAddress(value: string): string {
  return trimHidden(value).toLowerCase();
}

/**
 * Whether the database will take the address: after trimming hidden characters, at most 254 characters (code
 * points, as `char_length`), no hidden or control character left anywhere inside, and the database's shape.
 */
export function isValidAddress(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = trimHidden(value);
  if (trimmed.length === 0 || Array.from(trimmed).length > 254) return false;
  if (holdsHiddenOrControl(trimmed)) return false;
  return ADDRESS.test(trimmed);
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

export const MAX_SEARCH_LENGTH = 100;

/**
 * The search text as typed: control characters dropped (a NUL cannot reach the database), hidden characters
 * trimmed from both ends, at most 100 characters. Every other character is kept: it is data, matched literally
 * (see `containsAny`). Empty means "no search".
 */
export function searchTerm(value: unknown): string {
  if (typeof value !== 'string') return '';
  const kept = Array.from(trimHidden(value.replace(/\p{Cc}/gu, ''))).slice(0, MAX_SEARCH_LENGTH).join('');
  return trimHidden(kept);
}

/**
 * The term as a PostgreSQL regular expression that matches exactly that text: every ASCII character other than a
 * letter or digit is preceded by a backslash. In PostgreSQL's regular expressions (AREs) a backslash followed by
 * a character that is not a letter or digit is that character taken literally, so `_`, `%`, `*`, `.`, `(`, `\`
 * and the rest match only themselves; letters, digits, spaces and non-ASCII characters are literal already.
 */
export function literalPattern(term: string): string {
  return term.replace(/[!-/:-@[-`{-~]/g, (char) => `\\${char}`);
}

/**
 * A value in PostgREST's double-quoted form: inside the quotes a backslash and a double quote are written with a
 * backslash before them, so nothing in the value can close the quotes, and `,` `.` `:` `(` `)` inside them are
 * plain characters of the value.
 */
export function quotedValue(value: string): string {
  return `"${value.replace(/[\\"]/g, (char) => `\\${char}`)}"`;
}

/**
 * The `.or()` filter "any of these columns contains the term, ignoring case, literally":
 * `col.imatch."<literal pattern>"` for each column (`~*`, case-insensitive regular expression). `ilike` is not
 * used because PostgREST turns every `*` of an ilike value into `%`, so a typed `*` could not be matched.
 * Call only with a non-empty `searchTerm` result; columns are fixed names from the code, never from a request.
 */
export function containsAny(columns: readonly string[], term: string): string {
  const value = quotedValue(literalPattern(term));
  return columns.map((column) => `${column}.imatch.${value}`).join(',');
}

/** A 1-based page number from a query value; anything else is page 1. */
export function readPage(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(typeof raw === 'string' ? raw : '', 10);
  return Number.isSafeInteger(page) && page >= 1 && page <= 100_000 ? page : 1;
}
