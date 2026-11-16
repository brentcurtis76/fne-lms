import { describe, it, expect } from 'vitest';
import { receiptPathFromStored } from '../../../lib/expenses/receipt-path';

// GES-1.5a: a stored receipt value becomes a bare file name inside the receipts
// store, or null. All hosts, tokens and file names are invented.
const HOST = 'https://example-project.supabase.co';

describe('receiptPathFromStored — accepted forms', () => {
  it('a place in the store (boletas/<name>, the bot form) gives the name', () => {
    expect(receiptPathFromStored('boletas/receipt_1700000000000_ab12cd.pdf')).toBe('receipt_1700000000000_ab12cd.pdf');
  });

  it('a bare name gives the name', () => {
    expect(receiptPathFromStored('receipt_1700000000000_ab12cd.jpg')).toBe('receipt_1700000000000_ab12cd.jpg');
  });

  it('an old signed link (any query) gives the name', () => {
    expect(
      receiptPathFromStored(`${HOST}/storage/v1/object/sign/boletas/receipt_1_x.pdf?token=invented.token.value`)
    ).toBe('receipt_1_x.pdf');
  });

  it('a public link gives the name', () => {
    expect(receiptPathFromStored(`${HOST}/storage/v1/object/public/boletas/receipt_2_y.png`)).toBe('receipt_2_y.png');
  });

  it('a plain object link, on any host, gives the name', () => {
    expect(receiptPathFromStored('http://127.0.0.1:54321/storage/v1/object/boletas/receipt_3_z.pdf')).toBe(
      'receipt_3_z.pdf'
    );
  });

  it('the name in a link is URL-decoded once', () => {
    expect(receiptPathFromStored(`${HOST}/storage/v1/object/sign/boletas/boleta%20marzo.pdf?token=t`)).toBe(
      'boleta marzo.pdf'
    );
  });
});

describe('receiptPathFromStored — refusals', () => {
  it("another store's signed link", () => {
    expect(receiptPathFromStored(`${HOST}/storage/v1/object/sign/resources/receipt_1_x.pdf?token=t`)).toBeNull();
  });

  it('boletas/../x', () => {
    expect(receiptPathFromStored('boletas/../x')).toBeNull();
  });

  it('boletas/a/b (a deeper path)', () => {
    expect(receiptPathFromStored('boletas/a/b')).toBeNull();
  });

  it('a deeper path inside a link', () => {
    expect(receiptPathFromStored(`${HOST}/storage/v1/object/sign/boletas/a/b.pdf?token=t`)).toBeNull();
  });

  it('%2e%2e, bare and in a link', () => {
    expect(receiptPathFromStored('%2e%2e')).toBeNull();
    expect(receiptPathFromStored('boletas/%2e%2e')).toBeNull();
    expect(receiptPathFromStored(`${HOST}/storage/v1/object/sign/boletas/%2e%2e?token=t`)).toBeNull();
    expect(receiptPathFromStored(`${HOST}/storage/v1/object/sign/boletas/%2e%2e%2Fx?token=t`)).toBeNull();
  });

  it('a slash hidden as %2F in a link', () => {
    expect(receiptPathFromStored(`${HOST}/storage/v1/object/sign/boletas/a%2Fb.pdf?token=t`)).toBeNull();
  });

  it('double-encoded %252e%252e', () => {
    expect(receiptPathFromStored(`${HOST}/storage/v1/object/sign/boletas/%252e%252e?token=t`)).toBeNull();
    expect(receiptPathFromStored('boletas/%252e%252e')).toBeNull();
  });

  it('an outside address', () => {
    expect(receiptPathFromStored('https://evil.example.com/receipt.pdf')).toBeNull();
    expect(receiptPathFromStored('https://evil.example.com/files/boletas/receipt.pdf')).toBeNull();
  });

  it('a backslash or a control character', () => {
    expect(receiptPathFromStored('boletas/a\\b.pdf')).toBeNull();
    expect(receiptPathFromStored('boletas/a\u0000b.pdf')).toBeNull();
    expect(receiptPathFromStored(`${HOST}/storage/v1/object/sign/boletas/a%0Ab.pdf`)).toBeNull();
  });

  it('a name longer than 300 characters', () => {
    expect(receiptPathFromStored('boletas/' + 'a'.repeat(301))).toBeNull();
    expect(receiptPathFromStored('boletas/' + 'a'.repeat(300))).toBe('a'.repeat(300));
  });

  it('an empty value, the bare store prefix, null, undefined, a number, an object', () => {
    expect(receiptPathFromStored('')).toBeNull();
    expect(receiptPathFromStored('boletas/')).toBeNull();
    expect(receiptPathFromStored(null)).toBeNull();
    expect(receiptPathFromStored(undefined)).toBeNull();
    expect(receiptPathFromStored(42)).toBeNull();
    expect(receiptPathFromStored({ path: 'boletas/x.pdf' })).toBeNull();
  });
});
