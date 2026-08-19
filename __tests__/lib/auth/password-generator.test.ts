// @vitest-environment node
/**
 * S6 — CSPRNG password generation.
 *
 * Three properties are under test, and the third is the one the old code got
 * wrong in a way nobody noticed for months:
 *
 *   1. Randomness comes from a CSPRNG, with no `Math.random()` fallback.
 *   2. Character selection is unbiased (rejection sampling, not modulo).
 *   3. Output satisfies the SHARED policy. `utils/bulkUserParser` used to fill a
 *      missing password with `Math.random().toString(36).slice(-8)` — base-36,
 *      so lowercase and digits only, so the uppercase requirement failed on
 *      EVERY row. The regression test for that shape is at the bottom.
 *
 * Determinism comes from the injectable `randomBytes` seam, never from a
 * production switch: nothing here changes how a deployed build draws bytes.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  GENERATED_PASSWORD_LENGTH,
  createIndexSource,
  cryptoRandomBytes,
  generateCompliantPassword,
  generateCompliantPasswords,
  type RandomBytes,
} from '../../../lib/auth/password-generator';
import { PASSWORD_POLICY, validatePasswordPolicy } from '../../../lib/auth/password-policy';
import { generatePassword, generateBulkPasswords } from '../../../utils/passwordGenerator';

/** A byte source that cycles a fixed sequence — deterministic and repeatable. */
function sequenceBytes(sequence: number[]): RandomBytes {
  let cursor = 0;
  return (byteLength: number) => {
    const out = new Uint8Array(byteLength);
    for (let i = 0; i < byteLength; i += 1) {
      out[i] = sequence[cursor % sequence.length];
      cursor += 1;
    }
    return out;
  };
}

/** A counting source: 0,1,2,…,255,0,… — sweeps the whole byte range. */
const countingBytes: RandomBytes = (() => {
  let value = 0;
  return (byteLength: number) => {
    const out = new Uint8Array(byteLength);
    for (let i = 0; i < byteLength; i += 1) {
      out[i] = value % 256;
      value += 1;
    }
    return out;
  };
})();

describe('cryptoRandomBytes — the production source', () => {
  it('returns the requested number of bytes', () => {
    expect(cryptoRandomBytes(32)).toHaveLength(32);
  });

  it('does not repeat across draws', () => {
    const a = Buffer.from(cryptoRandomBytes(32)).toString('hex');
    const b = Buffer.from(cryptoRandomBytes(32)).toString('hex');
    expect(a).not.toBe(b);
  });

  it('is the default — a caller that passes nothing gets the CSPRNG', () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    generateCompliantPassword();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('generateCompliantPassword', () => {
  it('produces a policy-compliant password', () => {
    for (let i = 0; i < 200; i += 1) {
      const password = generateCompliantPassword();
      expect(validatePasswordPolicy(password)).toEqual({ valid: true, errors: [] });
    }
  });

  it('defaults to the generated length, well above the policy floor', () => {
    expect(generateCompliantPassword()).toHaveLength(GENERATED_PASSWORD_LENGTH);
    expect(GENERATED_PASSWORD_LENGTH).toBeGreaterThan(PASSWORD_POLICY.minLength);
  });

  it('honours an explicit longer length', () => {
    expect(generateCompliantPassword({ length: 24 })).toHaveLength(24);
  });

  it('clamps a shorter-than-policy request up to the policy minimum', () => {
    // A caller cannot ask for a weaker credential, only a stronger one.
    const password = generateCompliantPassword({ length: 4 });
    expect(password).toHaveLength(PASSWORD_POLICY.minLength);
    expect(validatePasswordPolicy(password).valid).toBe(true);
  });

  it('refuses a length above the policy maximum', () => {
    expect(() => generateCompliantPassword({ length: PASSWORD_POLICY.maxLength + 1 })).toThrow(
      /exceeds the policy maximum/
    );
  });

  it('excludes ambiguous characters (0/O, 1/l/I)', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateCompliantPassword()).not.toMatch(/[0O1lI]/);
    }
  });

  it('is deterministic for a given injected byte source', () => {
    const first = generateCompliantPassword({ randomBytes: sequenceBytes([7, 19, 3, 200, 41, 88]) });
    const second = generateCompliantPassword({ randomBytes: sequenceBytes([7, 19, 3, 200, 41, 88]) });
    expect(first).toBe(second);
    expect(validatePasswordPolicy(first).valid).toBe(true);
  });

  it('guarantees one character of each required class even from a degenerate source', () => {
    // Every byte is 0, so every draw picks index 0 of whichever alphabet is
    // in play. The class guarantees, not the randomness, are what must hold.
    const password = generateCompliantPassword({ randomBytes: () => new Uint8Array(64) });
    expect(validatePasswordPolicy(password).valid).toBe(true);
  });

  it('throws rather than biasing when the source only yields rejected bytes', () => {
    // 255 is above the rejection limit for every alphabet used here, so no draw
    // can ever succeed. The generator must fail loudly, not fall back.
    expect(() =>
      generateCompliantPassword({ randomBytes: () => new Uint8Array(64).fill(255) })
    ).toThrow(/rejection budget/);
  });

  it('throws when the source yields no bytes at all', () => {
    expect(() => generateCompliantPassword({ randomBytes: () => new Uint8Array(0) })).toThrow(
      /returned no bytes/
    );
  });

  it('every alphabet symbol is reachable from the real CSPRNG', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i += 1) {
      for (const char of generateCompliantPassword()) seen.add(char);
    }
    // 23 uppercase + 23 lowercase + 8 digits, ambiguous characters excluded.
    expect(seen.size).toBe(54);
  });

  it('has usable entropy — 500 draws collide zero times', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) seen.add(generateCompliantPassword());
    expect(seen.size).toBe(500);
  });
});

describe('generateCompliantPasswords — batches', () => {
  it('returns the requested count, all distinct, all compliant', () => {
    const passwords = generateCompliantPasswords(500);
    expect(passwords).toHaveLength(500);
    expect(new Set(passwords).size).toBe(500);
    for (const password of passwords) {
      expect(validatePasswordPolicy(password).valid).toBe(true);
    }
  });

  it('handles the largest supported import (500 users) without collision', () => {
    const passwords = generateCompliantPasswords(500);
    expect(new Set(passwords).size).toBe(passwords.length);
  });

  it('returns an empty array for zero', () => {
    expect(generateCompliantPasswords(0)).toEqual([]);
  });

  it.each([-1, 1.5, Number.NaN])('rejects an invalid count (%s)', (count) => {
    expect(() => generateCompliantPasswords(count as number)).toThrow(/invalid password count/);
  });

  it('fails loudly when the source repeats instead of looping forever', () => {
    expect(() => generateCompliantPasswords(5, { randomBytes: () => new Uint8Array(64) })).toThrow(
      /random source is repeating/
    );
  });
});

describe('UnbiasedIndexSource — the property modulo would break', () => {
  // A counting source sweeps 0..255 exactly once per cycle, which is what makes
  // this a precise test rather than a statistical one. For an alphabet of 23:
  //   modulo:    256 = 11*23 + 3, so indices 0,1,2 get 12 hits and the rest 11
  //   rejection: bytes >= 253 are discarded, so every index gets exactly 11
  const ALPHABET_SIZE = 23;
  const CYCLES = 10;

  function tally(size: number): number[] {
    const source = createIndexSource(countingBytes);
    const counts = new Array<number>(size).fill(0);
    for (let i = 0; i < 256 * CYCLES; i += 1) {
      // Rejected bytes are consumed without producing an index, so draw until
      // the whole cycle is spent rather than counting draws.
      counts[source.next(size)] += 1;
      if (counts.reduce((a, b) => a + b, 0) >= 253 * CYCLES) break;
    }
    return counts;
  }

  it('distributes every index exactly evenly over a full byte sweep', () => {
    const counts = tally(ALPHABET_SIZE);
    expect(Math.max(...counts)).toBe(Math.min(...counts));
  });

  it('modulo over the same source would NOT be even (the bias being avoided)', () => {
    const counts = new Array<number>(ALPHABET_SIZE).fill(0);
    for (let byte = 0; byte < 256; byte += 1) counts[byte % ALPHABET_SIZE] += 1;
    expect(Math.max(...counts)).toBe(12);
    expect(Math.min(...counts)).toBe(11);
  });

  it('refuses an alphabet it cannot sample without bias', () => {
    const source = createIndexSource(countingBytes);
    expect(() => source.next(0)).toThrow(/unsupported alphabet size/);
    expect(() => source.next(257)).toThrow(/unsupported alphabet size/);
    expect(() => source.next(2.5)).toThrow(/unsupported alphabet size/);
  });
});

describe('utils/passwordGenerator — the compatibility front', () => {
  it('generatePassword delegates to the CSPRNG generator', () => {
    const password = generatePassword();
    expect(password).toHaveLength(GENERATED_PASSWORD_LENGTH);
    expect(validatePasswordPolicy(password).valid).toBe(true);
  });

  it('generateBulkPasswords delegates and stays unique', () => {
    const passwords = generateBulkPasswords(50);
    expect(new Set(passwords).size).toBe(50);
  });

  it('no longer exports the name-and-year "memorable" generator', async () => {
    const module = await import('../../../utils/passwordGenerator');
    expect('generateMemorablePassword' in module).toBe(false);
  });
});

describe('S13 regression — the base-36 shape that failed every row', () => {
  it('Math.random().toString(36).slice(-8) cannot satisfy the policy', () => {
    // Not a test of the new code: a pin on WHY the old bulk import failed, so
    // nobody reintroduces the shape thinking it is merely "less random".
    for (let i = 0; i < 500; i += 1) {
      const legacyShape = Math.random().toString(36).slice(-8);
      expect(validatePasswordPolicy(legacyShape).valid).toBe(false);
      expect(validatePasswordPolicy(legacyShape).errors).toContain(
        'La contraseña debe contener al menos una letra mayúscula'
      );
    }
  });

  it('the replacement satisfies it every time', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(validatePasswordPolicy(generateCompliantPassword()).valid).toBe(true);
    }
  });
});
