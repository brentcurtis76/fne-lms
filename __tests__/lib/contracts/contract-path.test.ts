import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CONTRACTS_BUCKET, contractObjectName } from '../../../lib/contracts/contract-path';

// F26 (N146): what a contract stores in contratos.contrato_url — an old full
// address of the `contracts` store or, since F26, the bare object name —
// becomes the object's name inside that store, or null. All hosts, ids and
// names are invented.
const HOST = 'https://example-project.supabase.co';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', HOST);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('contractObjectName — accepted forms', () => {
  it('the store is contracts', () => {
    expect(CONTRACTS_BUCKET).toBe('contracts');
  });

  const cases: Array<[string, string]> = [
    ['contrato_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa_1700000000000.pdf', 'contrato_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa_1700000000000.pdf'],
    ['importado_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb_1700000000001.pdf', 'importado_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb_1700000000001.pdf'],
    ['C-001_1700000000002.pdf', 'C-001_1700000000002.pdf'],
    ['e2e-5eed0050/FNE-2026-03-901_firmado.pdf', 'e2e-5eed0050/FNE-2026-03-901_firmado.pdf'],
    [`${HOST}/storage/v1/object/public/contracts/C-002_1700000000003.pdf`, 'C-002_1700000000003.pdf'],
    [`${HOST}/storage/v1/object/sign/contracts/C-003_1700000000004.pdf?token=invented.token`, 'C-003_1700000000004.pdf'],
    [`${HOST}/storage/v1/object/public/contracts/contrato%20firmado.pdf`, 'contrato firmado.pdf'],
    [`${HOST}/storage/v1/object/public/contracts/e2e-5eed0050/FNE-2026-03-902_firmado.pdf`, 'e2e-5eed0050/FNE-2026-03-902_firmado.pdf'],
  ];

  it.each(cases)('%j gives %j', (stored, name) => {
    expect(contractObjectName(stored)).toBe(name);
  });
});

describe('contractObjectName — refusals', () => {
  const refused: Array<[string, unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['a number', 42],
    ['an address of another store', `${HOST}/storage/v1/object/public/facturas/invoice_1.pdf`],
    ['an address of the documents store', `${HOST}/storage/v1/object/public/resources/x.pdf`],
    ['an address on another host', 'https://evil.example.com/storage/v1/object/public/contracts/C-004_1.pdf'],
    ['an address that is not the store', `${HOST}/rest/v1/contratos`],
    ['an address with ..', `${HOST}/storage/v1/object/public/contracts/../facturas/x.pdf`],
    ['an address with an encoded slash', `${HOST}/storage/v1/object/public/contracts/a%2Fb.pdf`],
    ['an address with an encoded ?', `${HOST}/storage/v1/object/public/contracts/a%3Fb.pdf`],
    ['an address with an encoded #', `${HOST}/storage/v1/object/public/contracts/a%23b.pdf`],
    ['an address of the store with no file', `${HOST}/storage/v1/object/public/contracts/`],
    ['a name with ..', '../facturas/x.pdf'],
    ['a name that is ..', '..'],
    ['a name with %2F', 'a%2Fb.pdf'],
    ['a name with %', 'a%20b.pdf'],
    ['a name with ?', 'a?b.pdf'],
    ['a name with #', 'a#b.pdf'],
    ['a name with a backslash', 'a\\b.pdf'],
    ['a name starting with a slash', '/contracts/x.pdf'],
    ['a name with a double slash', 'a//b.pdf'],
    ['a name with a control character', 'a\u0000b.pdf'],
    ['a name with surrounding space', ' x.pdf'],
    ['another scheme', 'javascript:alert(1)'],
  ];

  it.each(refused)('%s → null', (_l, stored) => {
    expect(contractObjectName(stored as string | null)).toBeNull();
  });
});
