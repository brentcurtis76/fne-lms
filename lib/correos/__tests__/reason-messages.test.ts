// @vitest-environment node
/**
 * C1 and I2 (the reason has no default), C3 (addresses and plain messages), and the search words, on the kit's
 * own helpers. Invented addresses only.
 */
import { describe, expect, it } from 'vitest';
import { LEGAL_BASES, LEGAL_BASIS_LABELS, parseReason } from '../reason';
import { ilikeAny, isValidAddress, readIds, readPage, searchTerm } from '../address';
import { DATABASE_CODE_MESSAGES, GENERIC_FAILURE, databaseCode, databaseErrorMessage } from '../messages';
import { addressFingerprint } from '../contacts';

describe('C1 and I2: the reason has no default', () => {
  it('nothing given is refused; a missing or blank note is refused; an unknown basis is refused', () => {
    expect(parseReason(undefined).ok).toBe(false);
    expect(parseReason({}).ok).toBe(false);
    expect(parseReason({ legal_basis: 'manual_verified' }).ok).toBe(false);
    expect(parseReason({ legal_basis: 'manual_verified', basis_note: '  \n ' }).ok).toBe(false);
    expect(parseReason({ basis_note: 'Nota' }).ok).toBe(false);
    expect(parseReason({ legal_basis: 'implied', basis_note: 'Nota' }).ok).toBe(false);
    expect(parseReason({ legal_basis: ['manual_verified'], basis_note: 'Nota' }).ok).toBe(false);
  });

  it('a consent form needs its notice version unless every row carries one', () => {
    expect(parseReason({ legal_basis: 'consent_form', basis_note: 'Nota' }).ok).toBe(false);
    expect(parseReason({ legal_basis: 'consent_form', basis_note: 'Nota', consent_notice_version: 'v1' })).toEqual({
      ok: true,
      reason: { legal_basis: 'consent_form', basis_note: 'Nota', consent_notice_version: 'v1' },
    });
    expect(parseReason({ legal_basis: 'consent_form', basis_note: 'Nota' }, { versionFromRequest: false }).ok).toBe(true);
  });

  it('a stated reason is kept as typed (trimmed); a non-consent basis carries no version', () => {
    expect(parseReason({ legal_basis: ' customer_relationship ', basis_note: ' Cliente desde 2025 ', consent_notice_version: 'x' })).toEqual({
      ok: true,
      reason: { legal_basis: 'customer_relationship', basis_note: 'Cliente desde 2025', consent_notice_version: null },
    });
  });

  it('`allowed` narrows the bases', () => {
    expect(parseReason({ legal_basis: 'manual_verified', basis_note: 'Nota' }, { allowed: ['consent_form'] }).ok).toBe(false);
  });

  it('every basis has a plain label, and the refusal messages are plain Spanish', () => {
    for (const basis of LEGAL_BASES) expect(LEGAL_BASIS_LABELS[basis]).toMatch(/^[A-ZÁÉÍÓÚ]/);
    const refused = parseReason({});
    expect(refused.ok === false && refused.message).toMatch(/permiso/);
  });
});

describe('C3: addresses and messages', () => {
  it('accepts ordinary addresses, refuses malformed ones', () => {
    for (const ok of ['ana@example.test', ' Ana.Uno+boletin@Example.TEST ', 'nuñez@correos-prueba.invalid']) expect(isValidAddress(ok)).toBe(true);
    for (const bad of ['', 'ana', 'ana@', '@example.test', 'ana@example', 'ana@@example.test', 'a na@example.test', 'ana@example.test;b@example.test', '<ana@example.test>', 42, null]) {
      expect(isValidAddress(bad)).toBe(false);
    }
    expect(isValidAddress(`${'a'.repeat(250)}@example.test`)).toBe(false);
  });

  it('maps every database code to a plain message, and never shows an unknown error', () => {
    for (const [code, message] of Object.entries(DATABASE_CODE_MESSAGES)) {
      expect(databaseCode({ message: `email_add_contacts: ${code}` })).toBe(code);
      expect(databaseErrorMessage({ message: `email_add_contacts: ${code}` })).toBe(message);
      expect(message).not.toMatch(/_/);
    }
    expect(databaseErrorMessage({ message: 'email_erase_contact: contact_not_found' })).toMatch(/No encontramos/);
    expect(databaseErrorMessage({ message: 'duplicate key value violates unique constraint "x"' })).toBe(GENERIC_FAILURE);
    expect(databaseErrorMessage(null)).toBe(GENERIC_FAILURE);
  });

  it('the fingerprint matches the database form: SHA-256 hex of lower(trim(address))', () => {
    expect(addressFingerprint('  Ana@Example.TEST ')).toBe(addressFingerprint('ana@example.test'));
    expect(addressFingerprint('ana@example.test')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('search words and ids', () => {
  it('drops the characters PostgREST filters and LIKE give a meaning to', () => {
    expect(searchTerm('ana,x)')).toBe('ana x');
    expect(searchTerm('%_*\\"\':()')).toBe('');
    expect(searchTerm('  Muñoz  ')).toBe('Muñoz');
    expect(searchTerm(['ana'])).toBe('');
    expect(searchTerm('a'.repeat(300))).toHaveLength(100);
    expect(ilikeAny(['email', 'first_name'], 'ana')).toBe('email.ilike.*ana*,first_name.ilike.*ana*');
  });

  it('reads ids and pages strictly', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(readIds([id, id.toUpperCase()], 5)).toEqual([id]);
    expect(readIds([], 5)).toBeNull();
    expect(readIds('x', 5)).toBeNull();
    expect(readIds([id, 'x'], 5)).toBeNull();
    expect(readIds([id, id, id], 2)).toBeNull();
    expect(readPage('3')).toBe(3);
    for (const bad of [undefined, '0', '-1', 'abc', '1e9']) expect(readPage(bad)).toBe(1);
  });
});
