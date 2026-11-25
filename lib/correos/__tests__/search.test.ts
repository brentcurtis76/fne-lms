// @vitest-environment node
/**
 * The search text is matched literally, in every column, and can never change the PostgREST `or=(…)` filter; and
 * addresses are cleaned of the database's hidden characters exactly as `email_add_contacts` cleans them.
 * Invented addresses and names only.
 */
import { describe, expect, it } from 'vitest';
import { containsAny, isHiddenChar, isValidAddress, literalPattern, normalizeAddress, quotedValue, searchTerm, trimHidden } from '../address';
import { addressFingerprint, cleanRow } from '../contacts';

interface Condition {
  column: string;
  op: string;
  value: string;
}

/**
 * A strict model of how PostgREST reads the inside of `or=(…)`: conditions `column.op.value` separated by commas;
 * a value is either double-quoted (a backslash takes the next character as it is; the value ends at the closing
 * quote, which must be followed by `,` or the end) or bare (up to the next `,` or `)`). Anything else, such as a
 * nested `or(`, `and(` or `not.`, is reported as a nested group or an error, so a test can see it.
 */
function parseOr(filters: string): Condition[] {
  const out: Condition[] = [];
  let at = 0;
  const readName = (): string => {
    const start = at;
    while (at < filters.length && /[A-Za-z0-9_]/.test(filters[at])) at += 1;
    if (filters[at] === '(') throw new Error(`nested group at ${start}`);
    if (filters[at] !== '.') throw new Error(`expected "." at ${at}`);
    const name = filters.slice(start, at);
    at += 1;
    return name;
  };
  while (at < filters.length) {
    const column = readName();
    const op = readName();
    if (op === 'not') throw new Error('nested not');
    let value = '';
    if (filters[at] === '"') {
      at += 1;
      for (;;) {
        if (at >= filters.length) throw new Error('unclosed quote');
        const char = filters[at];
        if (char === '\\') {
          value += filters[at + 1] ?? '';
          at += 2;
        } else if (char === '"') {
          at += 1;
          break;
        } else {
          value += char;
          at += 1;
        }
      }
      if (at < filters.length && filters[at] !== ',') throw new Error(`text after the closing quote at ${at}`);
    } else {
      const start = at;
      while (at < filters.length && filters[at] !== ',' && filters[at] !== ')') at += 1;
      value = filters.slice(start, at);
      if (filters[at] === ')') throw new Error(`a ")" closes the group early at ${at}`);
    }
    out.push({ column, op, value });
    if (filters[at] === ',') at += 1;
  }
  return out;
}

/** What a PostgreSQL ARE of `literalPattern` means: every `\k` (k not a letter or digit) is the character k. */
function unescapeLiteral(pattern: string): string {
  return pattern.replace(/\\([\s\S])/g, '$1');
}

const COLUMNS = ['email', 'first_name', 'last_name', 'organization'] as const;

type Row = Record<(typeof COLUMNS)[number], string | null>;

const ROWS: Row[] = [
  { email: 'ana_maria.vista@example.test', first_name: 'Ana', last_name: 'Vista', organization: 'Colegio Uno' },
  { email: 'anaxmaria.vista@example.test', first_name: 'Ana', last_name: 'Otra', organization: 'Colegio Dos' },
  { email: 'pedro@example.test', first_name: 'Pedro', last_name: 'Soto', organization: "Liceo O'Higgins" },
  { email: 'cien@example.test', first_name: 'Cien', last_name: null, organization: 'Rebaja 100% (prueba)' },
  { email: 'coma@example.test', first_name: 'Soto, Juan', last_name: 'Pérez', organization: 'Escuela "La Estrella"' },
  { email: 'barra@example.test', first_name: 'Ruta', last_name: 'C:\\carpeta', organization: 'Fundación *Estrella*' },
  { email: 'nadie@example.test', first_name: 'Nadie', last_name: 'Común', organization: 'Colegio Tres' },
];

/**
 * Runs the filter the way the database would: parse it as PostgREST does, then for `imatch` apply the pattern
 * case-insensitively. A JavaScript regular expression without the `u` flag reads `\k` for punctuation k exactly as
 * PostgreSQL's ARE does (that character, literally); the first test below checks the pattern holds nothing else.
 */
function search(typed: string): string[] {
  const term = searchTerm(typed);
  if (!term) return ROWS.map((row) => row.email as string);
  const conditions = parseOr(containsAny(COLUMNS, term));
  return ROWS.filter((row) =>
    conditions.some((condition) => {
      expect(condition.op).toBe('imatch');
      const cell = row[condition.column as keyof Row];
      return cell !== null && new RegExp(condition.value, 'i').test(cell);
    })
  ).map((row) => row.email as string);
}

const HOSTILE = [
  '_', '%', "'", ',', '(', ')', '"', '\\', '*', ':', '.',
  'ana_maria', "O'Higgins", '100%', 'Soto, Juan', '"La Estrella"', 'C:\\carpeta', '*Estrella*',
  'x,email.ilike.*', 'a),or(email.ilike.*', 'a"),or(email.ilike.*', '\\",email.ilike.*', 'a\\', '"', '""', '\\\\"',
  'x.imatch.y', 'not.is.null', 'and(email.eq.x)', '***:a', '(?i)a',
];

describe('the search filter cannot be changed by what is typed', () => {
  it.each(HOSTILE)('%s: one imatch per column, the value comes back exactly as typed', (typed) => {
    const term = searchTerm(typed);
    expect(term).toBe(typed.trim());
    const conditions = parseOr(containsAny(COLUMNS, term));
    expect(conditions.map((condition) => condition.column)).toEqual([...COLUMNS]);
    for (const condition of conditions) {
      expect(condition.op).toBe('imatch');
      // The pattern holds only literal characters and `\` before ASCII punctuation, nothing else.
      expect(condition.value.replace(/\\[!-/:-@[-`{-~]/g, '')).not.toMatch(/[\\!-/:-@[-`{-~]/);
      expect(unescapeLiteral(condition.value)).toBe(term);
    }
  });

  it('the quoted value has no unescaped double quote, so it cannot be closed early', () => {
    for (const typed of HOSTILE) {
      const quoted = quotedValue(literalPattern(searchTerm(typed)));
      const inside = quoted.slice(1, -1);
      expect(quoted.startsWith('"') && quoted.endsWith('"')).toBe(true);
      // Remove every escaped pair; what is left must hold no quote and no backslash.
      expect(inside.replace(/\\[\\"]/g, '')).not.toMatch(/["\\]/);
    }
  });

  it('an injection attempt is one literal value per column', () => {
    expect(containsAny(['email'], 'x,email.ilike.*')).toBe(String.raw`email.imatch."x\\,email\\.ilike\\.\\*"`);
    expect(containsAny(['email'], 'a),or(email.ilike.*')).toBe(String.raw`email.imatch."a\\)\\,or\\(email\\.ilike\\.\\*"`);
    expect(search('x,email.ilike.*')).toEqual([]);
    expect(search('a),or(email.ilike.*')).toEqual([]);
  });
});

describe('the search text is matched literally, case-insensitively, in every column', () => {
  it('underscore: only itself', () => {
    expect(search('ana_maria.vista@example.test')).toEqual(['ana_maria.vista@example.test']);
    expect(search('ANA_MARIA')).toEqual(['ana_maria.vista@example.test']);
    expect(search('_')).toEqual(['ana_maria.vista@example.test']);
  });

  it('percent: only itself', () => {
    expect(search('%')).toEqual(['cien@example.test']);
    expect(search('100%')).toEqual(['cien@example.test']);
  });

  it('apostrophe', () => {
    expect(search("O'Higgins")).toEqual(['pedro@example.test']);
    expect(search("'")).toEqual(['pedro@example.test']);
  });

  it('comma', () => {
    expect(search('Soto, Juan')).toEqual(['coma@example.test']);
    expect(search(',')).toEqual(['coma@example.test']);
  });

  it('brackets', () => {
    expect(search('(prueba)')).toEqual(['cien@example.test']);
    expect(search('(')).toEqual(['cien@example.test']);
    expect(search(')')).toEqual(['cien@example.test']);
  });

  it('double quote', () => {
    expect(search('"La Estrella"')).toEqual(['coma@example.test']);
    expect(search('"')).toEqual(['coma@example.test']);
  });

  it('backslash and colon', () => {
    expect(search('C:\\carpeta')).toEqual(['barra@example.test']);
    expect(search('\\')).toEqual(['barra@example.test']);
    expect(search(':')).toEqual(['barra@example.test']);
  });

  it('asterisk: only itself, not "anything"', () => {
    expect(search('*')).toEqual(['barra@example.test']);
    expect(search('*Estrella*')).toEqual(['barra@example.test']);
  });

  it('a dot is a dot, not "any character"', () => {
    expect(search('a.vista')).toEqual(['ana_maria.vista@example.test', 'anaxmaria.vista@example.test']);
    expect(search('ana.maria')).toEqual([]);
  });

  it('a search that is empty after trimming is no search (the normal page)', () => {
    for (const blank of ['', '   ', '\u00a0\u200b\ufeff', '\t\n']) expect(searchTerm(blank)).toBe('');
    expect(search('  ')).toHaveLength(ROWS.length);
  });

  it('control characters are dropped, hidden characters trimmed, at most 100 characters', () => {
    expect(searchTerm('\u200bana\u0000_\u00a0')).toBe('ana_');
    expect(searchTerm('ñ'.repeat(150))).toBe('ñ'.repeat(100));
  });
});

describe('addresses are cleaned exactly as the database cleans them', () => {
  const NBSP = '\u00a0';
  const PADDING = ['\t', '\n', '\u000b', '\u000c', '\r', ' ', '\u0085', NBSP, '\u00ad', '\u1680', '\u180e', '\u2000', '\u200b', '\u200f', '\u2028', '\u202f', '\u205f', '\u2064', '\u2066', '\u2069', '\u3000', '\ufeff'];

  it('the hidden set is the database set, nothing more', () => {
    for (const char of PADDING) expect(isHiddenChar(char.charCodeAt(0))).toBe(true);
    for (const char of ['a', '@', '.', '\u0008', '\u000e', '\u0084', '\u2065', '\u206a', '\u2010', '\u3001', '\ufefe']) {
      expect(isHiddenChar(char.charCodeAt(0))).toBe(false);
    }
  });

  it('a padded address is the plain address: valid, same normal form and fingerprint', () => {
    const padded = `${PADDING.join('')}Ana.Uno@Example.TEST${PADDING.join('')}`;
    expect(trimHidden(padded)).toBe('Ana.Uno@Example.TEST');
    expect(isValidAddress(padded)).toBe(true);
    expect(normalizeAddress(padded)).toBe('ana.uno@example.test');
    expect(addressFingerprint(padded)).toBe(addressFingerprint('ana.uno@example.test'));
    // JavaScript's own trim() leaves some of them on: the reason for trimHidden.
    expect(`\u200bana@example.test\u00ad`.trim()).not.toBe('ana@example.test');
    expect(trimHidden(`\u200bana@example.test\u00ad`)).toBe('ana@example.test');
  });

  it('an address with U+00A0 or another hidden or control character inside is invalid', () => {
    expect(isValidAddress(`ana${NBSP}uno@example.test`)).toBe(false);
    expect(isValidAddress(`ana@example${NBSP}.test`)).toBe(false);
    for (const inside of ['\u00ad', '\u200b', '\u200e', '\u2060', '\u2066', '\ufeff', '\u0085', '\u0007', '\u007f']) {
      expect(isValidAddress(`ana${inside}uno@example.test`)).toBe(false);
    }
  });

  it('length is counted after trimming, in characters', () => {
    expect(isValidAddress(`${' '.repeat(10)}${'a'.repeat(241)}@example.test`)).toBe(true);
    expect(isValidAddress(`${'a'.repeat(242)}@example.test`)).toBe(false);
  });

  it('rows sent to email_add_contacts are cleaned the same way', () => {
    expect(cleanRow({ email: `\u200b ana@example.test${NBSP}`, first_name: `${NBSP}Ana\u200b`, last_name: '\u00ad', organization: null })).toEqual({
      email: 'ana@example.test',
      first_name: 'Ana',
      last_name: null,
      organization: null,
    });
    expect(cleanRow({ email: 'c@example.test', organization: undefined })).toEqual({ email: 'c@example.test' });
    expect(cleanRow({ email: 'b@example.test', basis_recorded_at: '2026-11-20T12:00:00.000Z', consent_notice_version: 'v2' })).toEqual({
      email: 'b@example.test',
      basis_recorded_at: '2026-11-20T12:00:00.000Z',
      consent_notice_version: 'v2',
    });
  });
});
