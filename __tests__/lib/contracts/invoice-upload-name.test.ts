import { describe, it, expect } from 'vitest';
import { invoiceObjectName, invoiceUploadObjectName } from '../../../lib/contracts/invoice-path';

// GES-1.4 (F2c, send-back 1): the stored name an invoice upload builds —
// `<prefix>_<cuotaId>_<ts>.<ext>`, the extension reduced to ASCII letters and
// digits in lower case, at most 10, `bin` when nothing is left — is always
// accepted by invoiceObjectName, so the invoice can be opened and removed.
// Invented ids.

const CUOTA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TS = 1700000000000;

describe('invoiceUploadObjectName', () => {
  it.each([
    ['a 250-letter extension', 'a.' + 'x'.repeat(250), 'xxxxxxxxxx'],
    ['an extension holding /', 'factura.pd/f', 'pdf'],
    ['an extension holding %', 'factura.p%2Fdf', 'p2fdf'],
    ['an extension holding #', 'factura.pd#f', 'pdf'],
    ['an extension holding ?', 'factura.pd?f', 'pdf'],
    ['an extension holding a space', 'factura.p df', 'pdf'],
    ['a name ending in a dot-dot', 'factura..', 'bin'],
    ['a dot-dot before the extension', 'factura..pdf', 'pdf'],
    ['no extension', 'factura', 'bin'],
    ['an upper-case PDF', 'FACTURA.PDF', 'pdf'],
    ['only symbols after the dot', 'factura.$$$', 'bin'],
    ['accented letters', 'factura.pdfé', 'pdf'],
  ])('%s → accepted by invoiceObjectName', (_l, fileName, ext) => {
    for (const prefix of ['invoice', 'cuota']) {
      const name = invoiceUploadObjectName(prefix, CUOTA, fileName, TS);
      expect(invoiceObjectName(name)).toBe(name);
      expect(name).toBe(`${prefix}_${CUOTA}_${TS}.${ext}`);
    }
  });

  it.each([
    ['factura-marzo.pdf', 'pdf'],
    ['foto.jpg', 'jpg'],
    ['scan.png', 'png'],
  ])('an ordinary %s keeps the same kind of name as before', (fileName, ext) => {
    expect(invoiceUploadObjectName('invoice', CUOTA, fileName, TS)).toBe(`invoice_${CUOTA}_${TS}.${ext}`);
    expect(invoiceUploadObjectName('cuota', CUOTA, fileName, TS)).toBe(`cuota_${CUOTA}_${TS}.${ext}`);
  });
});
