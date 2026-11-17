import { describe, it, expect } from 'vitest';
import { receiptPathFromStored, receiptExtensionFromFileName } from '../../../lib/expenses/receipt-path';

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

describe('receiptPathFromStored — accepted forms (GES-1.5d)', () => {
  it('odd but real extensions with a space or an accent', () => {
    expect(receiptPathFromStored('boletas/receipt_1_ab.foto marzo')).toBe('receipt_1_ab.foto marzo');
    expect(receiptPathFromStored('boletas/receipt_1_ab.año')).toBe('receipt_1_ab.año');
  });

  it('a legacy signed address with a ?token= query still gives the name', () => {
    expect(
      receiptPathFromStored(`${HOST}/storage/v1/object/sign/boletas/receipt_1_ab.pdf?token=invented.a.b&download=1`)
    ).toBe('receipt_1_ab.pdf');
  });

  it('an upper-case scheme still works', () => {
    expect(receiptPathFromStored('HTTPS://example-project.supabase.co/storage/v1/object/sign/boletas/receipt_1_ab.pdf?token=t')).toBe(
      'receipt_1_ab.pdf'
    );
  });
});

describe('receiptPathFromStored — refusals (GES-1.5d)', () => {
  it('? or # in a place or a bare name', () => {
    expect(receiptPathFromStored('boletas/a.pdf#x')).toBeNull();
    expect(receiptPathFromStored('boletas/a.pdf?x=1')).toBeNull();
    expect(receiptPathFromStored('a.pdf#x')).toBeNull();
  });

  it('a name that starts with a dot or with white space', () => {
    expect(receiptPathFromStored('boletas/.hidden')).toBeNull();
    expect(receiptPathFromStored('boletas/ a.pdf')).toBeNull();
    expect(receiptPathFromStored('boletas/a.pdf ')).toBeNull();
  });

  it('an address with a fragment', () => {
    expect(receiptPathFromStored(`${HOST}/storage/v1/object/sign/boletas/a.pdf#frag`)).toBeNull();
  });

  it('an address whose path the URL parser would normalise', () => {
    expect(receiptPathFromStored(`${HOST}/storage/v1/object/sign/boletas/x/../a.pdf`)).toBeNull();
    expect(receiptPathFromStored(`${HOST}/storage/v1/object/sign/other/..%2Fboletas/a.pdf`)).toBeNull();
    expect(receiptPathFromStored(`${HOST}/storage/v1/object/sign\\boletas\\a.pdf`)).toBeNull();
  });

  it('an encoded # or ? in an address', () => {
    expect(receiptPathFromStored(`${HOST}/storage/v1/object/sign/boletas/a.pdf%23x`)).toBeNull();
    expect(receiptPathFromStored(`${HOST}/storage/v1/object/sign/boletas/a.pdf%3Fx`)).toBeNull();
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

// GES-1.5e: the web form names a new receipt `receipt_<time>_<random>.<ext>`,
// the extension taken from the uploaded file's name. Invented file names.
describe('receiptExtensionFromFileName — the form always stores a place the helper accepts', () => {
  const cases: Array<[string, string]> = [
    ['scan.png ', 'png'],
    ['foto', 'bin'],
    ['a.b?c', 'bc'],
    ['informe.final.PDF', 'pdf'],
    ['boleta.a\u00f1o', 'ao'],
    ['x.', 'bin'],
    ['.hidden', 'hidden'],
  ];

  it('the old rule (name.split(".").pop()) gives places the helper refuses', () => {
    const oldPlace = (name: string) => `boletas/receipt_1_ab.${name.split('.').pop()}`;
    expect(receiptPathFromStored(oldPlace('scan.png '))).toBeNull();
    expect(receiptPathFromStored(oldPlace('a.b?c'))).toBeNull();
    // `foto` has no dot: the whole name becomes the "extension" — accepted by
    // the helper, but not a real extension.
    expect(oldPlace('foto')).toBe('boletas/receipt_1_ab.foto');
  });

  it.each(cases)('%j gives the extension %j and a place the helper accepts', (name, ext) => {
    expect(receiptExtensionFromFileName(name)).toBe(ext);
    const fileName = `receipt_1_ab.${receiptExtensionFromFileName(name)}`;
    expect(receiptPathFromStored(`boletas/${fileName}`)).toBe(fileName);
  });

  it('cuts the extension to 10 characters; a non-string gives bin', () => {
    expect(receiptExtensionFromFileName('a.abcdefghijklmnop')).toBe('abcdefghij');
    expect(receiptExtensionFromFileName(undefined)).toBe('bin');
    expect(receiptExtensionFromFileName(42)).toBe('bin');
  });
});
