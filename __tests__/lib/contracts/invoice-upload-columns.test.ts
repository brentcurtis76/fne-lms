import { describe, it, expect } from 'vitest';
import { invoiceObjectName, invoiceUploadColumns } from '../../../lib/contracts/invoice-path';

// GES-1.4 (F2c, A3): what an upload writes to the instalment. Since F2c the
// uploaded file's NAME goes into cuotas.factura_url (never a store address);
// the contract screen also writes the four metadata columns, as before; the
// cash-flow screen writes factura_url only, as before. Invented names.

const NAME = 'invoice_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa_1700000000000.pdf';

describe('invoiceUploadColumns', () => {
  it('the contract screen: the bare name in factura_url plus the four metadata columns', () => {
    const file = { name: 'factura-marzo.pdf', size: 2048, type: 'application/pdf' };
    expect(invoiceUploadColumns(NAME, file, '2026-11-17T12:00:00.000Z')).toEqual({
      factura_url: NAME,
      factura_filename: 'factura-marzo.pdf',
      factura_size: 2048,
      factura_type: 'application/pdf',
      factura_uploaded_at: '2026-11-17T12:00:00.000Z',
    });
  });

  it('the cash-flow screen: the bare name in factura_url only', () => {
    expect(invoiceUploadColumns('cuota_b_1.png')).toEqual({ factura_url: 'cuota_b_1.png' });
  });

  it('never stores an address, and what it stores is read back by the link route helper', () => {
    const stored = invoiceUploadColumns(NAME).factura_url;
    expect(stored).not.toMatch(/^https?:/i);
    expect(stored).not.toContain('/');
    expect(invoiceObjectName(stored)).toBe(NAME);
  });
});

describe('removal derives the file name from both stored forms (invoiceObjectName)', () => {
  it.each([
    [`https://example-project.supabase.co/storage/v1/object/public/facturas/${NAME}`, NAME],
    [NAME, NAME],
  ])('%j → %j', (stored, name) => {
    expect(invoiceObjectName(stored)).toBe(name);
  });
});
