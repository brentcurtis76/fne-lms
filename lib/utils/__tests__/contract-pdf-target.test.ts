import { describe, it, expect } from 'vitest';
import { resolveContractPdfTarget } from '../contract-pdf-target';

describe('resolveContractPdfTarget', () => {
  it('program-based contract with no uploaded file → template', () => {
    expect(resolveContractPdfTarget({ programa_id: 'p1' })).toEqual({ kind: 'template' });
  });

  it('imported/manual contract with no file → missing (prompt to upload)', () => {
    expect(resolveContractPdfTarget({ es_manual: true, programa_id: null })).toEqual({ kind: 'missing' });
    expect(resolveContractPdfTarget({ programa_id: null })).toEqual({ kind: 'missing' });
  });

  it('contract with an uploaded original → serve that file', () => {
    expect(
      resolveContractPdfTarget({ es_manual: true, contrato_url: 'https://x/y.pdf' }),
    ).toEqual({ kind: 'original', url: 'https://x/y.pdf' });
  });

  it('annex of a PROGRAM parent → template', () => {
    expect(resolveContractPdfTarget({ is_anexo: true, programa_id: 'p1' })).toEqual({ kind: 'template' });
  });

  it('annex of a MANUAL parent (programa_id null) → template, not missing (regression)', () => {
    // The exact CTR-2024-MLC-A1 shape: an annex, not manual itself, with no program.
    expect(
      resolveContractPdfTarget({ is_anexo: true, es_manual: false, programa_id: null }),
    ).toEqual({ kind: 'template' });
  });

  it('annex always renders from template even if it somehow has a url', () => {
    expect(
      resolveContractPdfTarget({ is_anexo: true, programa_id: null, contrato_url: 'https://x/y.pdf' }),
    ).toEqual({ kind: 'template' });
  });
});
