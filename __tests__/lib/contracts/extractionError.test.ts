// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractionErrorMessage, NOT_CONFIGURED_MESSAGE } from '../../../lib/contracts/extractionError';

describe('contract PDF extraction errors', () => {
  it('a missing AI key asks for manual entry', () => {
    expect(extractionErrorMessage(500, { error: 'API de Claude no configurada' })).toBe(NOT_CONFIGURED_MESSAGE);
  });

  it('a 413 answer (body too large) says the real limit, with or without a JSON body (GES-2.3)', () => {
    const tooLarge =
      'El PDF es demasiado grande para leerlo automáticamente (máximo 2,9 MB). Ingrese los datos manualmente.';
    expect(extractionErrorMessage(413, {})).toBe(tooLarge);
    expect(extractionErrorMessage(413, null)).toBe(tooLarge);
    expect(extractionErrorMessage(413, { error: 'Body exceeded 4mb limit' })).toBe(tooLarge);
  });

  it('other errors keep the route message, or a generic one', () => {
    expect(extractionErrorMessage(400, { error: 'PDF inválido' })).toBe('PDF inválido');
    expect(extractionErrorMessage(500, {})).toBe('Error al procesar el PDF');
    expect(extractionErrorMessage(502, null)).toBe('Error al procesar el PDF');
  });

  it('the importer has no sample-data fallback and the mock route is gone', () => {
    const root = join(__dirname, '../../..');
    const importer = readFileSync(join(root, 'components/contracts/ContractPDFImporter.tsx'), 'utf8');
    expect(importer).not.toContain('extract-pdf-mock');
    expect(() => readFileSync(join(root, 'pages/api/contracts/extract-pdf-mock.ts'))).toThrow();
  });
});
