import { describe, expect, it } from 'vitest';
import { isFirmaPendiente } from '../contract-status';

describe('isFirmaPendiente', () => {
  it('is true for an active contract whose signature is not confirmed', () => {
    expect(isFirmaPendiente({ estado: 'activo', firmado: false })).toBe(true);
    expect(isFirmaPendiente({ estado: 'activo', firmado: null })).toBe(true);
    expect(isFirmaPendiente({ estado: 'activo' })).toBe(true);
  });

  it('is false once the signature is confirmed', () => {
    expect(isFirmaPendiente({ estado: 'activo', firmado: true })).toBe(false);
  });

  it('is false for non-active estados regardless of firmado', () => {
    expect(isFirmaPendiente({ estado: 'pendiente', firmado: false })).toBe(false);
    expect(isFirmaPendiente({ estado: 'borrador', firmado: false })).toBe(false);
    expect(isFirmaPendiente({ estado: 'vigente', firmado: false })).toBe(false);
    expect(isFirmaPendiente({ estado: null, firmado: false })).toBe(false);
    expect(isFirmaPendiente({})).toBe(false);
  });

  it('does not depend on contrato_url (imported contracts carry a source PDF pre-signature)', () => {
    expect(
      isFirmaPendiente({ estado: 'activo', firmado: false, contrato_url: 'https://x/doc.pdf' } as any),
    ).toBe(true);
  });
});
