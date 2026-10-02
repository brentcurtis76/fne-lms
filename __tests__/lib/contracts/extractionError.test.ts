// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractionErrorMessage, NOT_CONFIGURED_MESSAGE } from '../../../lib/contracts/extractionError';

describe('contract PDF extraction errors', () => {
  it('a missing AI key asks for manual entry', () => {
    expect(extractionErrorMessage(500, { error: 'API de Claude no configurada' })).toBe(NOT_CONFIGURED_MESSAGE);
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
