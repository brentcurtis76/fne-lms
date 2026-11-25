/**
 * The contact-file reader of the Correos kit. No package: a small RFC 4180 reader, written for this.
 *
 * - Comma or semicolon, chosen from the header row (the one that occurs more often outside quotes; a tie is a
 *   comma). A byte-order mark is dropped. Line breaks may be CRLF, LF or CR.
 * - Quoted fields may hold the separator, line breaks and doubled quotes (`""`). A quote left open refuses the
 *   whole file.
 * - The first non-blank row is the header. An address column is required; first name, last name and
 *   organisation are optional. Header names are accepted in Spanish and English, any letter case, with or
 *   without accents.
 * - At most `MAX_CSV_ROWS` data rows; more refuses the whole file. Blank rows are skipped and not counted.
 * - Text that is not text (a NUL, a control character, or the replacement character that a failed decoding
 *   leaves) refuses the whole file.
 *
 * Cells are returned exactly as written (no trimming, no interpretation): a cell beginning with `=`, `+`, `-`
 * or `@`, or holding HTML, stays the same plain text. Whoever stores or shows it treats it as text.
 */
import { formatCount } from './labels';

export const MAX_CSV_ROWS = 20_000;

/** 8 MB: the largest file text the import accepts (the route's own body limit matches). */
export const MAX_CSV_BYTES = 8 * 1024 * 1024;

export interface CsvContactRow {
  email: string;
  first_name?: string;
  last_name?: string;
  organization?: string;
}

export type CsvColumn = keyof CsvContactRow;

export type CsvRefusal =
  | 'not_text'
  | 'empty'
  | 'no_rows'
  | 'no_address_column'
  | 'too_many_rows'
  | 'unclosed_quote'
  | 'too_large';

export type CsvParseResult =
  | { ok: true; delimiter: ',' | ';'; columns: CsvColumn[]; rows: CsvContactRow[] }
  | { ok: false; refusal: CsvRefusal; message: string };

/** The plain Spanish message for each refusal. */
export const CSV_REFUSAL_MESSAGES: Record<CsvRefusal, string> = {
  not_text: 'El archivo no es un archivo de texto (CSV). Guárdalo como CSV e inténtalo de nuevo.',
  empty: 'El archivo está vacío.',
  no_rows: 'El archivo tiene la fila de títulos, pero ninguna persona.',
  no_address_column:
    'El archivo no tiene una columna de correo. La primera fila debe nombrar las columnas, por ejemplo «correo», «nombre», «apellido», «organización».',
  too_many_rows: `El archivo tiene más de ${formatCount(MAX_CSV_ROWS)} filas. No se importó nada: divídelo en archivos más pequeños.`,
  unclosed_quote: 'El archivo tiene unas comillas que se abren y no se cierran. No se importó nada.',
  too_large: 'El archivo pesa más de 8 MB. No se importó nada: divídelo en archivos más pequeños.',
};

function refuse(refusal: CsvRefusal): CsvParseResult {
  return { ok: false, refusal, message: CSV_REFUSAL_MESSAGES[refusal] };
}

/** Header words, compared without case, accents, or the difference between spaces, `_`, `-` and `.`. */
const HEADER_NAMES: Record<CsvColumn, string[]> = {
  email: [
    'email', 'e mail', 'mail', 'correo', 'correo electronico', 'direccion de correo', 'direccion de correo electronico',
    'direccion', 'email address', 'e mail address', 'mail address', 'address',
  ],
  first_name: ['nombre', 'nombres', 'primer nombre', 'first name', 'firstname', 'given name', 'name'],
  last_name: ['apellido', 'apellidos', 'last name', 'lastname', 'surname', 'family name'],
  organization: [
    'organizacion', 'organization', 'organisation', 'institucion', 'institution', 'empresa', 'company',
    'colegio', 'escuela', 'establecimiento', 'school',
  ],
};

export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_.\-]+/g, ' ')
    .trim();
}

function columnFor(header: string): CsvColumn | null {
  const name = normalizeHeader(header);
  for (const column of Object.keys(HEADER_NAMES) as CsvColumn[]) {
    if (HEADER_NAMES[column].includes(name)) return column;
  }
  return null;
}

/** True when the text holds a NUL, a control character other than tab and line breaks, or U+FFFD. */
export function looksLikeBinary(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F�]/.test(text);
}

function chooseDelimiter(text: string): ',' | ';' {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      quoted = !quoted;
    } else if (!quoted) {
      if (ch === '\n' || ch === '\r') {
        if (commas + semicolons > 0) break;
      } else if (ch === ',') commas += 1;
      else if (ch === ';') semicolons += 1;
    }
  }
  return semicolons > commas ? ';' : ',';
}

/**
 * Splits the text into records of fields. Returns null when a quoted field is never closed.
 * `limit`: stop (and report `overflow`) once more than this many non-blank records have been read.
 */
function splitRecords(text: string, delimiter: string, limit: number): { records: string[][]; overflow: boolean } | null {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let fieldStarted = false;
  let i = 0;
  const n = text.length;

  const endRecord = () => {
    record.push(field);
    field = '';
    fieldStarted = false;
    if (!(record.length === 1 && record[0] === '') && record.some((cell) => cell.trim() !== '')) records.push(record);
    record = [];
  };

  while (i < n) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && !fieldStarted) {
      quoted = true;
      fieldStarted = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      record.push(field);
      field = '';
      fieldStarted = false;
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      endRecord();
      if (records.length > limit) return { records, overflow: true };
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch;
    fieldStarted = true;
    i += 1;
  }
  if (quoted) return null;
  if (field !== '' || record.length > 0) endRecord();
  return { records, overflow: records.length > limit };
}

/** Reads a contact file. See the top of this file for the rules. */
export function parseContactsCsv(input: unknown): CsvParseResult {
  if (typeof input !== 'string') return refuse('not_text');
  if (input.length > MAX_CSV_BYTES) return refuse('too_large');
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (looksLikeBinary(text)) return refuse('not_text');
  if (text.trim() === '') return refuse('empty');

  const delimiter = chooseDelimiter(text);
  // +1 for the header row.
  const split = splitRecords(text, delimiter, MAX_CSV_ROWS + 1);
  if (split === null) return refuse('unclosed_quote');
  if (split.overflow) return refuse('too_many_rows');
  const [header, ...data] = split.records;
  if (!header) return refuse('empty');

  const positions: Partial<Record<CsvColumn, number>> = {};
  header.forEach((cell, index) => {
    const column = columnFor(cell);
    if (column && positions[column] === undefined) positions[column] = index;
  });
  if (positions.email === undefined) return refuse('no_address_column');
  if (data.length === 0) return refuse('no_rows');

  const columns = (Object.keys(positions) as CsvColumn[]).sort(
    (a, b) => (positions[a] as number) - (positions[b] as number)
  );
  const rows: CsvContactRow[] = data.map((record) => {
    const row: CsvContactRow = { email: record[positions.email as number] ?? '' };
    for (const column of ['first_name', 'last_name', 'organization'] as const) {
      const at = positions[column];
      if (at !== undefined && record[at] !== undefined && record[at] !== '') row[column] = record[at];
    }
    return row;
  });
  return { ok: true, delimiter, columns, rows };
}
