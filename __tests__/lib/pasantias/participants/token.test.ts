// @vitest-environment node
/**
 * FIRST §4 / FIRST-B1 — the link token, its hash and the strict `Intake`
 * header parser.
 */
import { describe, expect, it } from 'vitest';
import {
  generateIntakeToken,
  hashIntakeToken,
  parseIntakeAuthorization,
} from '../../../../lib/pasantias/participants/token';

describe('generateIntakeToken', () => {
  it('is 43 base64url characters and different every time', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateIntakeToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('hashIntakeToken', () => {
  it('is the 64-character SHA-256 hex digest', () => {
    // FIPS 180-2 test vector.
    expect(hashIntakeToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashIntakeToken(generateIntakeToken())).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('parseIntakeAuthorization', () => {
  const token = 'A'.repeat(21) + '_-' + 'z9'.repeat(10);

  it('accepts exactly "Intake <43 base64url chars>"', () => {
    expect(token).toHaveLength(43);
    expect(parseIntakeAuthorization(`Intake ${token}`)).toBe(token);
  });

  it.each([
    ['a Bearer header', `Bearer ${token}`],
    ['a lowercase scheme', `intake ${token}`],
    ['a missing value', 'Intake '],
    ['the bare scheme', 'Intake'],
    ['two spaces', `Intake  ${token}`],
    ['a leading space', ` Intake ${token}`],
    ['a trailing space', `Intake ${token} `],
    ['42 characters', `Intake ${token.slice(1)}`],
    ['44 characters', `Intake ${token}A`],
    ['a non-base64url character', `Intake ${token.slice(1)}+`],
    ['an empty string', ''],
  ])('rejects %s', (_label, header) => {
    expect(parseIntakeAuthorization(header)).toBeNull();
  });

  it('rejects a missing or repeated header', () => {
    expect(parseIntakeAuthorization(undefined)).toBeNull();
    expect(parseIntakeAuthorization([`Intake ${token}`])).toBeNull();
  });
});
