// @vitest-environment node
/**
 * I3 (file shapes) and I4 (nothing dangerous comes in through a cell) on the kit's own CSV reader.
 * Invented addresses only.
 */
import { describe, expect, it } from 'vitest';
import { MAX_CSV_ROWS, parseContactsCsv, type CsvParseResult } from '../csv';

function rowsOf(result: CsvParseResult) {
  if (result.ok === false) throw new Error(`refused: ${result.refusal}`);
  return result.rows;
}

describe('I3: file shapes', () => {
  it('reads a comma file with a header row', () => {
    const result = parseContactsCsv('email,first name,last name,organization\nana@example.test,Ana,Uno,Liceo A\nbeto@example.test,Beto,Dos,\n');
    expect(result.ok && result.delimiter).toBe(',');
    expect(rowsOf(result)).toEqual([
      { email: 'ana@example.test', first_name: 'Ana', last_name: 'Uno', organization: 'Liceo A' },
      { email: 'beto@example.test', first_name: 'Beto', last_name: 'Dos' },
    ]);
  });

  it('reads a semicolon file with Spanish headers, CRLF and a byte-order mark', () => {
    const result = parseContactsCsv('﻿Correo electrónico;Nombre;Apellidos;Institución\r\nana@example.test;Ana;Uno;Liceo A\r\n');
    expect(result.ok && result.delimiter).toBe(';');
    expect(rowsOf(result)).toEqual([{ email: 'ana@example.test', first_name: 'Ana', last_name: 'Uno', organization: 'Liceo A' }]);
  });

  it('accepts header names in any case, with or without accents, with _ or -', () => {
    for (const header of ['CORREO', 'E-mail', 'e_mail', 'Dirección de correo', 'Email Address', 'mail']) {
      expect(rowsOf(parseContactsCsv(`${header}\nana@example.test\n`))).toEqual([{ email: 'ana@example.test' }]);
    }
    expect(rowsOf(parseContactsCsv('Organización,correo,Apellido,NOMBRE\nLiceo,ana@example.test,Uno,Ana\n'))).toEqual([
      { email: 'ana@example.test', first_name: 'Ana', last_name: 'Uno', organization: 'Liceo' },
    ]);
  });

  it('only the address column is required; other columns are ignored', () => {
    expect(rowsOf(parseContactsCsv('telefono,correo,cargo\n+56 9,ana@example.test,Directora\n'))).toEqual([{ email: 'ana@example.test' }]);
  });

  it('quoted fields hold commas, semicolons, line breaks and doubled quotes; accents stay', () => {
    const text = 'correo,nombre,apellido,organización\n' +
      'nuñez@example.test,"Muñoz, José","Ñandú\nSegunda línea","Colegio ""Árbol""; sede sur"\n' +
      '"ana@example.test",Ána,Pérez,"a,b,c"\n';
    expect(rowsOf(parseContactsCsv(text))).toEqual([
      { email: 'nuñez@example.test', first_name: 'Muñoz, José', last_name: 'Ñandú\nSegunda línea', organization: 'Colegio "Árbol"; sede sur' },
      { email: 'ana@example.test', first_name: 'Ána', last_name: 'Pérez', organization: 'a,b,c' },
    ]);
  });

  it('a semicolon file whose quoted cells hold commas is still read as semicolon', () => {
    const result = parseContactsCsv('correo;nombre\nana@example.test;"Uno, Dos, Tres"\n');
    expect(result.ok && result.delimiter).toBe(';');
    expect(rowsOf(result)).toEqual([{ email: 'ana@example.test', first_name: 'Uno, Dos, Tres' }]);
  });

  it('blank rows are skipped; a last row without a line break is read; CR-only line breaks work', () => {
    expect(rowsOf(parseContactsCsv('correo\n\nana@example.test\n , \n\nbeto@example.test'))).toEqual([
      { email: 'ana@example.test' },
      { email: 'beto@example.test' },
    ]);
    expect(rowsOf(parseContactsCsv('correo\rana@example.test\rbeto@example.test\r'))).toHaveLength(2);
  });

  it('keeps malformed and repeated addresses for the database to count', () => {
    expect(rowsOf(parseContactsCsv('correo\nmal-escrita\nAna@Example.test\nana@example.test \n'))).toEqual([
      { email: 'mal-escrita' },
      { email: 'Ana@Example.test' },
      { email: 'ana@example.test ' },
    ]);
  });

  it(`${MAX_CSV_ROWS} rows are accepted; ${MAX_CSV_ROWS + 1} rows are refused whole`, () => {
    const body = (n: number) => Array.from({ length: n }, (_, i) => `p${i}@example.test`).join('\n');
    expect(rowsOf(parseContactsCsv(`correo\n${body(MAX_CSV_ROWS)}\n`))).toHaveLength(MAX_CSV_ROWS);
    const over = parseContactsCsv(`correo\n${body(MAX_CSV_ROWS + 1)}\n`);
    expect(over).toMatchObject({ ok: false, refusal: 'too_many_rows' });
    expect(over.ok === false && over.message).toMatch(/más de 20\.000 filas/);
  });

  it('a file without an address column is refused whole', () => {
    const result = parseContactsCsv('nombre,apellido,organización\nAna,Uno,Liceo\n');
    expect(result).toMatchObject({ ok: false, refusal: 'no_address_column' });
    expect(result.ok === false && result.message).toMatch(/columna de correo/);
  });

  it('content that is not text is refused whole', () => {
    const png = String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d);
    for (const input of [png, 'correo\nana@example.test\u0000\n', 'correo\nana�@example.test\n', 'correo\n\u0007\n']) {
      expect(parseContactsCsv(input)).toMatchObject({ ok: false, refusal: 'not_text' });
    }
    for (const input of [undefined, null, 42, { csv: 'correo' }, ['correo']]) {
      expect(parseContactsCsv(input)).toMatchObject({ ok: false, refusal: 'not_text' });
    }
  });

  it('an empty file, a header alone, and an unclosed quote are refused whole', () => {
    expect(parseContactsCsv('')).toMatchObject({ ok: false, refusal: 'empty' });
    expect(parseContactsCsv('﻿  \n\n')).toMatchObject({ ok: false, refusal: 'empty' });
    expect(parseContactsCsv('correo,nombre\n')).toMatchObject({ ok: false, refusal: 'no_rows' });
    expect(parseContactsCsv('correo,nombre\nana@example.test,"Ana\n')).toMatchObject({ ok: false, refusal: 'unclosed_quote' });
  });

  it('every refusal carries a plain Spanish message', () => {
    for (const input of ['', 'correo\n', 'nombre\nAna\n', 'correo\n"x\n', 'correo\n\u0000']) {
      const result = parseContactsCsv(input);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.message).toMatch(/^El archivo /);
    }
  });
});

describe('I4: cells stay plain text', () => {
  it('a cell beginning with =, +, - or @, or holding HTML, comes out exactly as written', () => {
    const text = 'correo,nombre,apellido,organización\n' +
      'a@example.test,=HYPERLINK("http://x"),+SUM(A1),-2+3\n' +
      'b@example.test,@cmd,<script>alert(1)</script>,"<img src=x onerror=alert(1)>"\n';
    expect(rowsOf(parseContactsCsv(text))).toEqual([
      { email: 'a@example.test', first_name: '=HYPERLINK("http://x")', last_name: '+SUM(A1)', organization: '-2+3' },
      { email: 'b@example.test', first_name: '@cmd', last_name: '<script>alert(1)</script>', organization: '<img src=x onerror=alert(1)>' },
    ]);
  });
});
