import { describe, it, expect } from 'vitest';
import { invoiceObjectName } from '../../../lib/contracts/invoice-path';

// GES-1.4 (F2c, A1): what an instalment stores in cuotas.factura_url — an old
// full address of the `facturas` store or, since A3, the bare file name —
// becomes the file name inside that store, or null. All hosts and names are
// invented.
const HOST = 'https://example-project.supabase.co';

describe('invoiceObjectName — accepted forms', () => {
  const cases: Array<[string, string]> = [
    ['invoice_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa_1700000000000.pdf', 'invoice_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa_1700000000000.pdf'],
    ['cuota_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb_1700000000000.png', 'cuota_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb_1700000000000.png'],
    [`${HOST}/storage/v1/object/public/facturas/invoice_1_a.pdf`, 'invoice_1_a.pdf'],
    [`${HOST}/storage/v1/object/sign/facturas/invoice_2_b.pdf?token=invented.token`, 'invoice_2_b.pdf'],
    ['http://127.0.0.1:54321/storage/v1/object/facturas/cuota_3_c.jpg', 'cuota_3_c.jpg'],
    ['HTTPS://other-host.example.com/storage/v1/object/public/facturas/invoice_4_d.pdf', 'invoice_4_d.pdf'],
    [`${HOST}/storage/v1/object/public/facturas/factura%20marzo.pdf`, 'factura marzo.pdf'],
  ];

  it.each(cases)('%j gives %j', (stored, name) => {
    expect(invoiceObjectName(stored)).toBe(name);
  });

  it('the host of an old address is ignored: only the name is used', () => {
    expect(invoiceObjectName('https://evil.example.com/storage/v1/object/public/facturas/invoice_5_e.pdf')).toBe(
      'invoice_5_e.pdf'
    );
  });
});

describe('invoiceObjectName — refusals', () => {
  const refused: Array<[string, unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['a number', 42],
    ['a name with a slash', 'facturas/invoice_1_a.pdf'],
    ['a deeper path', 'a/b.pdf'],
    ['a backslash', 'a\\b.pdf'],
    ['dots', '..'],
    ['dots inside a name', 'invoice..pdf'],
    ['a percent sign', 'invoice%2e%2e'],
    ['a question mark', 'invoice.pdf?x=1'],
    ['a hash', 'invoice.pdf#x'],
    ['a leading dot', '.hidden'],
    ['surrounding white space', ' invoice.pdf'],
    ['a control character', 'inv\u0000oice.pdf'],
    ['a name longer than 300 characters', 'a'.repeat(301)],
    ['another store', `${HOST}/storage/v1/object/public/resources/invoice_1_a.pdf`],
    ['another store holding a facturas folder', `${HOST}/storage/v1/object/public/resources/facturas/invoice_1_a.pdf`],
    ['an address outside the store', 'https://evil.example.com/files/facturas/invoice.pdf'],
    ['the bare store address', `${HOST}/storage/v1/object/public/facturas/`],
    ['a deeper path in an address', `${HOST}/storage/v1/object/public/facturas/a/b.pdf`],
    ['.. in an address', `${HOST}/storage/v1/object/public/facturas/../boletas/x.pdf`],
    ['an encoded slash in an address', `${HOST}/storage/v1/object/public/facturas/a%2Fb.pdf`],
    ['encoded dots in an address', `${HOST}/storage/v1/object/public/facturas/%2e%2e`],
    ['double-encoded dots in an address', `${HOST}/storage/v1/object/public/facturas/%252e%252e`],
    ['an encoded ? in an address', `${HOST}/storage/v1/object/public/facturas/a.pdf%3Fx`],
    ['an encoded # in an address', `${HOST}/storage/v1/object/public/facturas/a.pdf%23x`],
    ['a fragment in an address', `${HOST}/storage/v1/object/public/facturas/a.pdf#frag`],
    ['a backslash in an address', `${HOST}/storage/v1/object/public\\facturas\\a.pdf`],
    ['a bad escape in an address', `${HOST}/storage/v1/object/public/facturas/a%E0%A4%A.pdf`],
  ];

  it.each(refused)('%s → null', (_label, stored) => {
    expect(invoiceObjectName(stored as string | null)).toBeNull();
  });

  it('a name of exactly 300 characters is accepted', () => {
    expect(invoiceObjectName('a'.repeat(300))).toBe('a'.repeat(300));
  });
});
